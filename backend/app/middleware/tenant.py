from fastapi import Request, HTTPException, Depends
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Optional
import re

from app.database import get_db
from app.config import settings


class TenantMiddleware(BaseHTTPMiddleware):
    """Resolve tenant from subdomain, header, or widget config"""

    async def dispatch(self, request: Request, call_next):
        tenant_slug = self._extract_tenant_slug(request)

        if tenant_slug:
            # Attach tenant to request state
            request.state.tenant_slug = tenant_slug
            # Fetch tenant info for downstream use
            tenant = await self._get_tenant(tenant_slug)
            if tenant:
                request.state.tenant = tenant
            else:
                # For widget endpoints, allow 404 to be handled by endpoint
                pass

        response = await call_next(request)
        return response

    def _extract_tenant_slug(self, request: Request) -> Optional[str]:
        path = request.url.path

        # Widget endpoints: /widget/{endpoint}/{tenant_slug}
        widget_match = re.match(r'^/widget/[^/]+/([^/]+)', path)
        if widget_match:
            return widget_match.group(1)

        # API endpoints with tenant in header
        if path.startswith('/api/') or path.startswith('/admin/'):
            # Check for X-Tenant-Slug header
            tenant_header = request.headers.get('X-Tenant-Slug')
            if tenant_header:
                return tenant_header

            # Check for subdomain (tenant.yourdomain.com)
            host = request.headers.get('host', '')
            if '.' in host:
                subdomain = host.split('.')[0]
                if subdomain not in ['www', 'admin', 'api', 'widget', 'localhost']:
                    return subdomain

        return None

    async def _get_tenant(self, slug: str):
        """Fetch tenant from database"""
        db = get_db()
        try:
            result = await db.execute(
                "SELECT * FROM tenants WHERE slug = ? AND plan != 'deleted'",
                [slug]
            )
            if result.rows:
                row = result.rows[0]
                return dict(zip(result.columns, row))
        except Exception:
            pass
        return None


async def get_current_tenant(request: Request) -> dict:
    """Dependency to get current tenant"""
    if not hasattr(request.state, 'tenant') or not request.state.tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return request.state.tenant


async def get_tenant_slug(request: Request) -> str:
    """Dependency to get tenant slug"""
    if not hasattr(request.state, 'tenant_slug') or not request.state.tenant_slug:
        raise HTTPException(status_code=400, detail="Tenant slug required")
    return request.state.tenant_slug