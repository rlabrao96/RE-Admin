import psycopg2
conn = psycopg2.connect("postgresql://postgres:TL9%2FK%2A8%2ATYT%2A%2Ae_@db.graewgsuxnsuvdgplila.supabase.co:5432/postgres")
cur = conn.cursor()
cur.execute("""
-- Insert the user as an admin in their profile
INSERT INTO public.profiles (id, email, role, full_name)
VALUES ('13ccb7ff-7890-490d-b89a-b84ede5df3a0', 'rafaellabra96@gmail.com', 'admin', 'Rafael Labra')
ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Rafael Labra', email = 'rafaellabra96@gmail.com';

-- Insert a test building for him
INSERT INTO public.buildings (id, name, address, commune, region, rut_edificio, admin_id) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Edificio Las Torres', 'Av. Providencia 1234', 'Providencia', 'Metropolitana', '76543210-5', '13ccb7ff-7890-490d-b89a-b84ede5df3a0') ON CONFLICT DO NOTHING;

-- Insert two floors
INSERT INTO public.floors (id, building_id, number) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 1),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 2) ON CONFLICT DO NOTHING;

-- Insert four units
INSERT INTO public.units (id, floor_id, number, type, surface_m2, alicuota) VALUES
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '101', 'departamento', 65.5, 3.5),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', '102', 'departamento', 72.0, 3.8),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', '201', 'departamento', 65.5, 3.5),
  ('33333333-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', '202', 'departamento', 80.0, 4.2) ON CONFLICT DO NOTHING;

-- Add Rafael as a resident of 101 so he can see the resident portal too
INSERT INTO public.residents (id, unit_id, user_id, move_in_date, is_owner, status) VALUES
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '13ccb7ff-7890-490d-b89a-b84ede5df3a0', '2024-01-01', true, 'active') ON CONFLICT DO NOTHING;
""")
conn.commit()
print("Seed data applied successfully!")
