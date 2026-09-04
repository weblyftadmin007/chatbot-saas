from typing import Dict, Any, List, Optional
from app.services.llm import llm_service
from app.database import get_db
from app.config import settings
import json
from datetime import datetime, timedelta, timezone
import pytz


class IntentService:
    def __init__(self):
        self.intents = [
            'book_appointment',
            'cancel_appointment',
            'check_availability',
            'general_query',
            'transfer_human',
            'unclear'
        ]

    async def classify(self, text: str) -> str:
        """Classify user intent"""
        return await llm_service.classify_intent(text)

    async def extract_booking_details(self, text: str) -> Dict[str, Any]:
        """Extract structured booking details"""
        return await llm_service.extract_booking_details(text)

    async def extract_cancel_details(self, text: str) -> Dict[str, Any]:
        """Extract appointment cancellation details"""
        prompt = f"""Extract appointment cancellation details. Return JSON only.

User: "{text}"

Return format:
{{
  "appointment_id": "ID if mentioned or null",
  "date": "YYYY-MM-DD if mentioned or null",
  "time": "HH:MM if mentioned or null",
  "email": "email if mentioned or null"
}}"""

        response = await llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            temperature=0.1,
            max_tokens=150
        )

        try:
            import json
            return json.loads(response.strip())
        except Exception:
            return {
                "appointment_id": None,
                "date": None,
                "time": None,
                "email": None
            }


intent_service = IntentService()


class AppointmentService:
    def __init__(self):
        self.default_slot_duration = 30  # minutes
        self.default_buffer = 15  # minutes

    async def get_business_hours(self, tenant: dict) -> Dict[str, Any]:
        """Get business hours from tenant settings"""
        hours = tenant.get('business_hours') if isinstance(tenant, dict) else None
        if not hours and hasattr(tenant, 'get_business_hours'):
            hours = tenant.get_business_hours()
        if not hours:
            # Default: Mon-Fri 9-17
            return {
                "monday": {"open": "09:00", "close": "17:00"},
                "tuesday": {"open": "09:00", "close": "17:00"},
                "wednesday": {"open": "09:00", "close": "17:00"},
                "thursday": {"open": "09:00", "close": "17:00"},
                "friday": {"open": "09:00", "close": "17:00"},
                "saturday": {"open": None, "close": None},
                "sunday": {"open": None, "close": None}
            }
        return hours if isinstance(hours, dict) else {}

    def _parse_time(self, time_str: str) -> tuple:
        """Parse HH:MM to (hour, minute)"""
        parts = time_str.split(':')
        return int(parts[0]), int(parts[1])

    def _generate_slots_for_day(
        self,
        date: datetime,
        business_hours: Dict[str, Any],
        slot_duration: int,
        buffer_minutes: int,
        existing_appointments: List[Dict[str, Any]],
        timezone_str: str
    ) -> List[Dict[str, Any]]:
        """Generate available slots for a single day"""
        tz = pytz.timezone(timezone_str)
        day_name = date.strftime('%A').lower()

        hours = business_hours.get(day_name)
        if not hours or not hours.get('open') or not hours.get('close'):
            return []

        open_hour, open_min = self._parse_time(hours['open'])
        close_hour, close_min = self._parse_time(hours['close'])

        # Convert existing appointments to time ranges for this day
        busy_ranges = []
        for appt in existing_appointments:
            appt_start = datetime.fromtimestamp(appt['start_time'], tz=timezone.utc).astimezone(tz)
            appt_end = datetime.fromtimestamp(appt['end_time'], tz=timezone.utc).astimezone(tz)
            if appt_start.date() == date.date():
                busy_ranges.append((appt_start, appt_end))

        # Generate slots
        slots = []
        current = date.replace(hour=open_hour, minute=open_min, second=0, microsecond=0)
        current = tz.localize(current) if current.tzinfo is None else current
        end_time = date.replace(hour=close_hour, minute=close_min, second=0, microsecond=0)
        end_time = tz.localize(end_time) if end_time.tzinfo is None else end_time

        while current + timedelta(minutes=slot_duration) <= end_time:
            slot_end = current + timedelta(minutes=slot_duration)

            # Check if slot conflicts with existing appointment
            conflict = False
            for busy_start, busy_end in busy_ranges:
                # Check overlap with buffer
                if (current < busy_end + timedelta(minutes=buffer_minutes) and
                    slot_end > busy_start - timedelta(minutes=buffer_minutes)):
                    conflict = True
                    break

            if not conflict:
                slots.append({
                    'start_time': int(current.timestamp()),
                    'end_time': int(slot_end.timestamp()),
                    'available': True
                })

            current += timedelta(minutes=slot_duration + buffer_minutes)

        return slots

    async def get_availability(
        self,
        tenant_id: str,
        start_date: str,
        end_date: str,
        timezone_str: str = "UTC"
    ) -> List[Dict[str, Any]]:
        """Get available slots for date range"""
        db = get_db()

        # Get tenant settings
        tenant_result = await db.execute(
            "SELECT * FROM tenants WHERE id = ?",
            [tenant_id]
        )
        if not tenant_result.rows:
            return []

        tenant = dict(zip(tenant_result.columns, tenant_result.rows[0]))

        # Get existing appointments in range
        tz = pytz.timezone(timezone_str)
        start_dt = tz.localize(datetime.strptime(start_date, "%Y-%m-%d"))
        end_dt = tz.localize(datetime.strptime(end_date, "%Y-%m-%d")) + timedelta(days=1)

        start_ts = int(start_dt.timestamp())
        end_ts = int(end_dt.timestamp())

        appt_result = await db.execute("""
            SELECT start_time, end_time FROM appointments
            WHERE tenant_id = ? AND status IN ('pending', 'confirmed')
            AND start_time >= ? AND start_time < ?
        """, [tenant_id, start_ts, end_ts])

        existing_appointments = [
            {'start_time': row[0], 'end_time': row[1]}
            for row in appt_result.rows
        ]

        # Get business hours
        business_hours = await self.get_business_hours(tenant)
        slot_duration = tenant.get('slot_duration', self.default_slot_duration)
        buffer_minutes = tenant.get('buffer_minutes', self.default_buffer)

        # Generate slots for each day
        all_slots = []
        current_date = start_dt
        while current_date < end_dt:
            day_slots = self._generate_slots_for_day(
                current_date, business_hours, slot_duration, buffer_minutes,
                existing_appointments, timezone_str
            )
            all_slots.extend(day_slots)
            current_date += timedelta(days=1)

        return all_slots

    async def book_appointment(
        self,
        tenant_id: str,
        conversation_id: str,
        end_user_id: str,
        start_time: int,
        end_time: int,
        title: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Book an appointment"""
        import uuid
        db = get_db()

        # Check for conflicts
        conflict_result = await db.execute("""
            SELECT id FROM appointments
            WHERE tenant_id = ? AND status IN ('pending', 'confirmed')
            AND start_time < ? AND end_time > ?
        """, [tenant_id, end_time, start_time])

        if conflict_result.rows:
            raise ValueError("Time slot no longer available")

        appointment_id = str(uuid.uuid4())
        now = int(datetime.now(timezone.utc).timestamp())

        await db.execute("""
            INSERT INTO appointments
            (id, tenant_id, conversation_id, end_user_id, start_time, end_time,
             status, title, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
        """, [appointment_id, tenant_id, conversation_id, end_user_id,
              start_time, end_time, title, notes, now, now])

        return {
            'id': appointment_id,
            'status': 'confirmed',
            'start_time': start_time,
            'end_time': end_time
        }

    async def cancel_appointments(
        self,
        tenant_id: str,
        end_user_ids: List[str],
        start_time: Optional[int] = None,
        end_time: Optional[int] = None
    ) -> int:
        """Cancel all pending/confirmed appointments for the given users,
        optionally within a time range. Returns the number cancelled."""
        db = get_db()
        if not end_user_ids:
            return 0

        placeholders = ','.join(['?'] * len(end_user_ids))
        query = f"""
            SELECT id FROM appointments
            WHERE tenant_id = ? AND end_user_id IN ({placeholders})
            AND status IN ('pending', 'confirmed')
        """
        params = [tenant_id] + end_user_ids
        if start_time is not None:
            query += " AND start_time >= ?"
            params.append(start_time)
        if end_time is not None:
            query += " AND start_time < ?"
            params.append(end_time)

        result = await db.execute(query, params)
        ids = [row[0] for row in result.rows]
        if not ids:
            return 0

        id_placeholders = ','.join(['?'] * len(ids))
        await db.execute(
            f"UPDATE appointments SET status = 'cancelled', updated_at = ? WHERE id IN ({id_placeholders})",
            [int(datetime.now(timezone.utc).timestamp())] + ids
        )
        return len(ids)

    async def cancel_appointment(
        self,
        tenant_id: str,
        appointment_id: str = None,
        end_user_id: str = None,
        start_time: int = None
    ) -> bool:
        """Cancel an appointment"""
        db = get_db()

        if appointment_id:
            result = await db.execute("""
                UPDATE appointments SET status = 'cancelled', updated_at = ?
                WHERE id = ? AND tenant_id = ? AND status IN ('pending', 'confirmed')
            """, [int(datetime.now(timezone.utc).timestamp()), appointment_id, tenant_id])
        elif end_user_id and start_time:
            result = await db.execute("""
                UPDATE appointments SET status = 'cancelled', updated_at = ?
                WHERE tenant_id = ? AND end_user_id = ? AND start_time = ?
                AND status IN ('pending', 'confirmed')
            """, [int(datetime.now(timezone.utc).timestamp()), tenant_id, end_user_id, start_time])
        else:
            return False

        return True

    async def get_user_appointments(
        self,
        tenant_id: str,
        end_user_id: str
    ) -> List[Dict[str, Any]]:
        """Get all appointments for a user"""
        db = get_db()
        result = await db.execute("""
            SELECT id, start_time, end_time, status, title, notes, created_at
            FROM appointments
            WHERE tenant_id = ? AND end_user_id = ?
            ORDER BY start_time DESC
        """, [tenant_id, end_user_id])

        return [dict(zip(result.columns, row)) for row in result.rows]


appointment_service = AppointmentService()