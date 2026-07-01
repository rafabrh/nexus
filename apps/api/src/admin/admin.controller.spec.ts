import { describe, it, expect, vi } from 'vitest';
import { AdminController } from './admin.controller';
import type { TenantService } from './tenant.service';

/** AdminController is a thin delegator; we assert it forwards to TenantService
 *  with the right arguments (the authorization is covered by RolesGuard). */
function makeController() {
  const tenants = {
    listTenants: vi.fn(),
    getTenant: vi.fn(),
    registerTenant: vi.fn(),
    toggleTenant: vi.fn(),
    setN8nWebhookUrl: vi.fn(),
    addUser: vi.fn(),
    removeUser: vi.fn(),
  };
  const controller = new AdminController(tenants as unknown as TenantService);
  return { controller, tenants };
}

describe('AdminController', () => {
  it('registerTenant forwards instancia + adminEmail to the service', async () => {
    const { controller, tenants } = makeController();
    const entry = { instancia: 'shk' };
    tenants.registerTenant.mockResolvedValue(entry);

    const result = await controller.registerTenant({
      instancia: 'shk',
      adminEmail: 'a@shk.com',
    });

    expect(tenants.registerTenant).toHaveBeenCalledWith('shk', 'a@shk.com');
    expect(result).toBe(entry);
  });

  it('toggleTenant forwards instancia + active to the service', async () => {
    const { controller, tenants } = makeController();
    tenants.toggleTenant.mockResolvedValue({ instancia: 'shk', active: false });

    await controller.toggleTenant('shk', { active: false });

    expect(tenants.toggleTenant).toHaveBeenCalledWith('shk', false);
  });

  it('setInstanceConfig forwards instancia + n8nWebhookUrl to the service', async () => {
    const { controller, tenants } = makeController();
    const entry = { instancia: 'shk', n8nWebhookUrl: 'https://n8n/w/shk' };
    tenants.setN8nWebhookUrl.mockResolvedValue(entry);

    const result = await controller.setInstanceConfig('shk', {
      n8nWebhookUrl: 'https://n8n/w/shk',
    });

    expect(tenants.setN8nWebhookUrl).toHaveBeenCalledWith('shk', 'https://n8n/w/shk');
    expect(result).toBe(entry);
  });

  it('addUser forwards instancia + user dto to the service', async () => {
    const { controller, tenants } = makeController();
    const dto = { email: 'op@shk.com', role: 'operator' as const };
    tenants.addUser.mockResolvedValue({ instancia: 'shk' });

    await controller.addUser('shk', dto);

    expect(tenants.addUser).toHaveBeenCalledWith('shk', dto);
  });

  it('removeUser forwards instancia + email to the service', async () => {
    const { controller, tenants } = makeController();
    const entry = { instancia: 'shk' };
    tenants.removeUser.mockResolvedValue(entry);

    const result = await controller.removeUser('shk', 'op@shk.com');

    expect(tenants.removeUser).toHaveBeenCalledWith('shk', 'op@shk.com');
    expect(result).toBe(entry);
  });
});
