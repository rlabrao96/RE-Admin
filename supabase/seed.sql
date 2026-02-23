-- ============================================================
-- EdificioApp: Seed Data (Dev/Testing Only)
-- For local development — NOT for production
-- ============================================================

-- Note: auth.users must be inserted via Supabase Auth API or Dashboard
-- These UUIDs match test accounts you can create in your Supabase Dashboard

-- Test profiles (run AFTER creating users in Supabase Auth)
/*
insert into public.profiles (id, email, full_name, phone, rut, role) values
  ('00000000-0000-0000-0000-000000000001', 'admin@edificioapp.cl', 'Carlos Pérez Silva', '+56912345678', '12345678-9', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'resident@edificioapp.cl', 'María González Rojas', '+56987654321', '98765432-1', 'resident'),
  ('00000000-0000-0000-0000-000000000003', 'resident2@edificioapp.cl', 'Juan Soto Muñoz', '+56911122233', '11111111-1', 'resident');

insert into public.buildings (id, name, address, commune, region, rut_edificio, admin_id) values
  ('b0000000-0000-0000-0000-000000000001', 'Edificio Las Torres', 'Av. Providencia 1234', 'Providencia', 'Metropolitana', '76543210-5', '00000000-0000-0000-0000-000000000001');

insert into public.floors (id, building_id, number) values
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1),
  ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 2),
  ('f0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 3);

insert into public.units (id, floor_id, number, type, surface_m2, alicuota) values
  ('u0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '101', 'departamento', 65.5, 3.5),
  ('u0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', '102', 'departamento', 72.0, 3.8),
  ('u0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', '201', 'departamento', 65.5, 3.5),
  ('u0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', '202', 'departamento', 80.0, 4.2);

insert into public.residents (id, unit_id, user_id, move_in_date, is_owner, status) values
  ('r0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2024-01-01', true, 'active'),
  ('r0000000-0000-0000-0000-000000000002', 'u0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '2024-03-01', false, 'active');
*/
