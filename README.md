# Mordisco OS V16 Profesional

Sistema limpio para GitHub, Vercel y Supabase.

## Flujo

- Caja/POS crea y cobra pedidos.
- Comandas crea pedidos de mesa y solo los envía a Cocina.
- Cocina prepara y cambia estados.
- Solo Administrador y Cajero pueden cobrar.
- Empleados ingresan con usuario y PIN.

## Instalación

1. Abre Supabase → SQL Editor.
2. Abre `supabase/01_instalacion_v16.sql`.
3. Copia todo, pégalo y pulsa **Run**.
4. El usuario inicial es:
   - Empleado: `Administrador`
   - PIN: `1234`
5. Sube el contenido de este proyecto a un repositorio nuevo en GitHub.
6. En Vercel importa ese repositorio:
   - Preset: Other
   - Root Directory: `/`
7. Abre la URL publicada.

## Seguridad inicial

Después de ingresar, crea otro administrador con un PIN privado. El PIN `1234` es únicamente para la instalación inicial.

## Estructura

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `supabase/01_instalacion_v16.sql`
- `vercel.json`
