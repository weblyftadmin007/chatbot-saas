import httpx
from typing import Optional
from datetime import datetime
from app.config import settings


class EmailService:
    def __init__(self):
        self.gas_url = settings.gas_webapp_url
        self.client = httpx.AsyncClient(timeout=10.0)

    async def send_email(
        self,
        to: str,
        subject: str,
        html: str
    ) -> bool:
        """Send email via Google Apps Script web app"""
        if not self.gas_url:
            print("GAS_WEBAPP_URL not configured")
            return False

        try:
            response = await self.client.post(
                self.gas_url,
                json={"to": to, "subject": subject, "html": html}
            )
            result = response.json()
            return result.get('success', False)
        except Exception as e:
            print(f"Email send error: {e}")
            return False

    async def send_appointment_confirmation(
        self,
        to_email: str,
        to_name: str,
        appointment: dict,
        tenant_name: str,
        tenant_settings: dict,
        is_reminder: bool = False
    ) -> bool:
        """Send appointment confirmation or reminder"""
        start_dt = datetime.fromtimestamp(appointment['start_time'])
        end_dt = datetime.fromtimestamp(appointment['end_time'])

        date_str = start_dt.strftime("%A, %B %d, %Y")
        time_str = f"{start_dt.strftime('%I:%M %p')} - {end_dt.strftime('%I:%M %p')}"

        if is_reminder:
            subject = f"Reminder: Your appointment with {tenant_name} tomorrow"
            greeting = "This is a reminder about your upcoming appointment:"
        else:
            subject = f"Appointment Confirmed with {tenant_name}"
            greeting = "Your appointment has been confirmed:"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #f8fafc; border-radius: 12px; padding: 32px;">
                <h1 style="color: #1e40af; margin-top: 0;">{tenant_name}</h1>
                <p style="font-size: 16px;">Hi {to_name or 'there'},</p>
                <p style="font-size: 16px;">{greeting}</p>

                <div style="background: white; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #3b82f6;">
                    <p style="margin: 0 0 8px 0;"><strong>Date:</strong> {date_str}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Time:</strong> {time_str}</p>
                    {f'<p style="margin: 0 0 8px 0;"><strong>Service:</strong> {appointment.get("title", "")}</p>' if appointment.get('title') else ''}
                    {f'<p style="margin: 0;"><strong>Notes:</strong> {appointment.get("notes", "")}</p>' if appointment.get('notes') else ''}
                </div>

                <p style="font-size: 14px; color: #64748b;">
                    If you need to reschedule or cancel, please reply to this email or contact {tenant_name} directly.
                </p>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                    This email was sent by the AI chatbot on behalf of {tenant_name}.
                </p>
            </div>
        </body>
        </html>
        """

        return await self.send_email(to_email, subject, html)

    async def send_business_notification(
        self,
        to_email: str,
        appointment: dict,
        customer_name: str,
        customer_email: str,
        tenant_name: str
    ) -> bool:
        """Notify business of new booking"""
        start_dt = datetime.fromtimestamp(appointment['start_time'])

        subject = f"New Booking: {customer_name} on {start_dt.strftime('%b %d')}"
        html = f"""
        <!DOCTYPE html>
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #f8fafc; border-radius: 12px; padding: 32px;">
                <h1 style="color: #1e40af; margin-top: 0;">New Appointment Booked</h1>
                <p>You have a new booking from your website chatbot:</p>

                <div style="background: white; border-radius: 8px; padding: 24px; margin: 24px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Customer:</strong> {customer_name}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Email:</strong> {customer_email}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Date:</strong> {start_dt.strftime('%A, %B %d, %Y')}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Time:</strong> {start_dt.strftime('%I:%M %p')} - {datetime.fromtimestamp(appointment['end_time']).strftime('%I:%M %p')}</p>
                    {f'<p style="margin: 0;"><strong>Service:</strong> {appointment.get("title", "")}</p>' if appointment.get('title') else ''}
                    {f'<p style="margin: 0;"><strong>Notes:</strong> {appointment.get("notes", "")}</p>' if appointment.get('notes') else ''}
                </div>

                <p style="font-size: 14px; color: #64748b;">
                    Log in to your dashboard to manage this appointment.
                </p>
            </div>
        </body>
        </html>
        """

        return await self.send_email(to_email, subject, html)


email_service = EmailService()