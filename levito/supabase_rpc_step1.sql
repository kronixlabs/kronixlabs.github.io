-- LEVITO MES - Supabase Step 1
-- Ejecutar en Supabase SQL Editor.
-- Crea estructura minima + RPC criticas para:
-- GET_BOOTSTRAP, GET_ALL_ACTIVOS, GET_LOTE_ESTADO, INICIAR_LOTE, PASAR_ETAPA_DESDE_MODAL
-- (incluye PRE_GUARDAR_ETAPA como soporte de modal)

create extension if not exists pgcrypto;

-- =========================
-- Tablas base
-- =========================
create table if not exists mes_productos (
  codigo text primary key,
  nombre text not null,
  empaque text,
  peso_neto numeric,
  unidades_caja numeric,
  activo boolean not null default true
);

create table if not exists mes_materias_decorado (
  nombre text primary key,
  activo boolean not null default true
);

create table if not exists mes_clientes (
  nombre text primary key,
  activo boolean not null default true
);

create table if not exists mes_consecutivo (
  id smallint primary key default 1 check (id = 1),
  ultimo_numero integer not null default 5225,
  updated_at timestamptz not null default now()
);

insert into mes_consecutivo (id, ultimo_numero)
values (1, 5225)
on conflict (id) do nothing;

create table if not exists mes_lotes_activos (
  slot integer primary key,
  id_lote text not null unique,
  producto_id text not null,
  producto text not null,
  etapa_actual text not null,
  operario text,
  hora_inicio timestamptz not null default now(),
  hora_etapa timestamptz not null default now(),
  datos_json jsonb not null default '{}'::jsonb,
  etapas_saltadas text
);

create table if not exists mes_bitacora (
  id bigserial primary key,
  id_registro uuid not null default gen_random_uuid(),
  id_lote text not null,
  slot integer,
  etapa text not null,
  pin text,
  operario text,
  timestamp_registro timestamptz not null default now(),
  datos_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_mes_bitacora_lote_ts
  on mes_bitacora (id_lote, timestamp_registro desc);

create table if not exists mes_bitacora_detalle (
  id bigserial primary key,
  id_detalle uuid not null default gen_random_uuid(),
  id_lote text not null,
  slot integer,
  etapa text not null,
  producto_id text,
  timestamp_registro timestamptz not null default now(),
  pin text,
  operario text,
  detalle_json jsonb not null default '{}'::jsonb,
  total_gramos_masa numeric not null default 0
);

create index if not exists idx_mes_bit_det_lote_etapa_ts
  on mes_bitacora_detalle (id_lote, etapa, timestamp_registro desc);

-- =========================
-- Helpers
-- =========================
create or replace function mes_next_etapa(p_etapa text)
returns text
language sql
immutable
as $$
  select case coalesce(p_etapa,'')
    when 'Mojado' then 'Porcionado'
    when 'Porcionado' then 'Levado'
    when 'Levado' then 'Decorado'
    when 'Decorado' then 'Horneado'
    when 'Horneado' then 'Enfriado'
    when 'Enfriado' then 'Empaque'
    when 'Empaque' then 'Finalizado'
    else 'Finalizado'
  end;
$$;

-- =========================
-- RPC: GET_PRODUCTOS (soporte)
-- =========================
create or replace function get_productos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'codigo', codigo,
        'nombre', nombre,
        'empaque', empaque,
        'peso_neto', peso_neto,
        'unidades_caja', unidades_caja
      ) order by nombre
    ),
    '[]'::jsonb
  )
  from mes_productos
  where activo = true;
$$;

-- =========================
-- RPC: GET_BOOTSTRAP
-- =========================
create or replace function get_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'productos',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'codigo', p.codigo,
            'nombre', p.nombre,
            'empaque', p.empaque,
            'peso_neto', p.peso_neto,
            'unidades_caja', p.unidades_caja
          ) order by p.nombre
        )
        from mes_productos p
        where p.activo = true
      ), '[]'::jsonb),
    'materias_decorado',
      coalesce((
        select jsonb_agg(jsonb_build_object('nombre', m.nombre) order by m.nombre)
        from mes_materias_decorado m
        where m.activo = true
      ), '[]'::jsonb),
    'clientes',
      coalesce((
        select jsonb_agg(jsonb_build_object('cliente', c.nombre) order by c.nombre)
        from mes_clientes c
        where c.activo = true
      ), '[]'::jsonb)
  );
$$;

-- =========================
-- RPC: GET_ALL_ACTIVOS
-- =========================
create or replace function get_all_activos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slot', l.slot,
        'id_lote', l.id_lote,
        'producto_id', l.producto_id,
        'producto', l.producto,
        'etapa_actual', l.etapa_actual,
        'operario', l.operario,
        'hora_inicio', l.hora_inicio,
        'hora_etapa', l.hora_etapa,
        'hora_etapa_str', to_char(l.hora_etapa at time zone 'America/Bogota', 'HH24:MI'),
        'tiempo_etapa', concat(greatest(0, floor(extract(epoch from (now() - l.hora_etapa))/60))::int, ' min'),
        'alerta', null,
        'mensaje_alerta', ''
      )
      order by l.slot
    ),
    '[]'::jsonb
  )
  from mes_lotes_activos l;
$$;

-- =========================
-- RPC: GET_LOTE_ESTADO
-- =========================
create or replace function get_lote_estado(p_id_lote text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lote mes_lotes_activos%rowtype;
  v_detalle jsonb := '{}'::jsonb;
begin
  select * into v_lote
  from mes_lotes_activos
  where id_lote = p_id_lote;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Lote no encontrado.');
  end if;

  select coalesce(d.detalle_json, '{}'::jsonb) ||
         jsonb_build_object('total_gramos_masa', coalesce(d.total_gramos_masa, 0))
  into v_detalle
  from mes_bitacora_detalle d
  where d.id_lote = p_id_lote
    and d.etapa = v_lote.etapa_actual
  order by d.timestamp_registro desc
  limit 1;

  return jsonb_build_object(
    'status', 'ok',
    'lote', jsonb_build_object(
      'slot', v_lote.slot,
      'id_lote', v_lote.id_lote,
      'producto_id', v_lote.producto_id,
      'producto', v_lote.producto,
      'etapa_actual', v_lote.etapa_actual,
      'operario', v_lote.operario,
      'hora_inicio', v_lote.hora_inicio,
      'hora_etapa', v_lote.hora_etapa
    ),
    'detalle', coalesce(v_detalle, '{}'::jsonb)
  );
end;
$$;

-- =========================
-- RPC: INICIAR_LOTE
-- =========================
create or replace function iniciar_lote(
  p_slot integer,
  p_producto_id text,
  p_cantidad numeric,
  p_temp_amb numeric default null,
  p_hum_amb numeric default null,
  p_pin text default null,
  p_operario text default 'OPERARIO1',
  p_obs text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_id_lote text;
  v_now timestamptz := now();
  v_num integer;
  v_data jsonb;
begin
  if p_slot is null or p_slot < 1 then
    return jsonb_build_object('status','error','message','Slot invalido.');
  end if;
  if coalesce(trim(p_producto_id),'') = '' or coalesce(p_cantidad,0) <= 0 then
    return jsonb_build_object('status','error','message','Producto y cantidad son obligatorios.');
  end if;

  if exists(select 1 from mes_lotes_activos where slot = p_slot) then
    return jsonb_build_object('status','error','message','El slot ya tiene lote activo.');
  end if;

  select nombre into v_nombre
  from mes_productos
  where codigo = p_producto_id
  limit 1;
  v_nombre := coalesce(v_nombre, p_producto_id);

  -- lock consecutivo
  perform 1 from mes_consecutivo where id = 1 for update;
  select ultimo_numero + 1 into v_num
  from mes_consecutivo
  where id = 1;

  update mes_consecutivo
  set ultimo_numero = v_num, updated_at = now()
  where id = 1;

  v_id_lote := 'L:' || lpad(v_num::text, 6, '0');
  v_data := jsonb_build_object(
    'cantidad', p_cantidad,
    'temp_amb', p_temp_amb,
    'hum_amb', p_hum_amb,
    'materias_primas', '[]'::jsonb,
    'obs', p_obs
  );

  insert into mes_lotes_activos(
    slot, id_lote, producto_id, producto, etapa_actual, operario, hora_inicio, hora_etapa, datos_json, etapas_saltadas
  )
  values(
    p_slot, v_id_lote, p_producto_id, v_nombre, 'Mojado', p_operario, v_now, v_now, v_data, null
  );

  insert into mes_bitacora(id_lote, slot, etapa, pin, operario, timestamp_registro, datos_json)
  values(v_id_lote, p_slot, 'Mojado', p_pin, p_operario, v_now, v_data);

  return jsonb_build_object(
    'status', 'ok',
    'id_lote', v_id_lote,
    'message', 'Lote iniciado correctamente.'
  );
end;
$$;

-- =========================
-- RPC: PRE_GUARDAR_ETAPA (soporte modal)
-- =========================
create or replace function pre_guardar_etapa(
  p_id_lote text,
  p_slot integer,
  p_etapa text,
  p_producto_id text default null,
  p_pin text default null,
  p_operario text default 'OPERARIO1',
  p_cantidad numeric default null,
  p_temp_amb numeric default null,
  p_hum_amb numeric default null,
  p_obs text default null,
  p_rows jsonb default '[]'::jsonb,
  p_total_gramos_masa numeric default 0,
  p_peso_unidad numeric default null,
  p_num_porciones numeric default null,
  p_num_latas numeric default null,
  p_unid_por_lata numeric default null,
  p_materias_decorado jsonb default '[]'::jsonb,
  p_temp_horno numeric default null,
  p_tiempo_horno numeric default null,
  p_temp_interna numeric default null,
  p_unid_finales numeric default null,
  p_unid_nc numeric default null,
  p_lote_empaque text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detalle jsonb;
begin
  v_detalle := jsonb_build_object(
    'cantidad', p_cantidad,
    'temp_amb', p_temp_amb,
    'hum_amb', p_hum_amb,
    'obs', p_obs,
    'rows', coalesce(p_rows,'[]'::jsonb),
    'peso_unidad', p_peso_unidad,
    'num_porciones', p_num_porciones,
    'num_latas', p_num_latas,
    'unid_por_lata', p_unid_por_lata,
    'materias_decorado', coalesce(p_materias_decorado,'[]'::jsonb),
    'temp_horno', p_temp_horno,
    'tiempo_horno', p_tiempo_horno,
    'temp_interna', p_temp_interna,
    'unid_finales', p_unid_finales,
    'unid_nc', p_unid_nc,
    'lote_empaque', p_lote_empaque
  );

  insert into mes_bitacora_detalle(
    id_lote, slot, etapa, producto_id, pin, operario, detalle_json, total_gramos_masa
  )
  values(
    p_id_lote, p_slot, p_etapa, p_producto_id, p_pin, p_operario, v_detalle, coalesce(p_total_gramos_masa,0)
  );

  update mes_lotes_activos
  set datos_json = v_detalle,
      operario = coalesce(p_operario, operario)
  where id_lote = p_id_lote;

  return jsonb_build_object('status','ok','message','Datos pre-guardados.');
end;
$$;

-- =========================
-- RPC: PASAR_ETAPA_DESDE_MODAL
-- =========================
create or replace function pasar_etapa_desde_modal(
  p_id_lote text,
  p_slot integer,
  p_etapa text,
  p_producto_id text default null,
  p_pin text default null,
  p_operario text default 'OPERARIO1',
  p_cantidad numeric default null,
  p_temp_amb numeric default null,
  p_hum_amb numeric default null,
  p_obs text default null,
  p_rows jsonb default '[]'::jsonb,
  p_total_gramos_masa numeric default 0,
  p_peso_unidad numeric default null,
  p_num_porciones numeric default null,
  p_num_latas numeric default null,
  p_unid_por_lata numeric default null,
  p_materias_decorado jsonb default '[]'::jsonb,
  p_temp_horno numeric default null,
  p_tiempo_horno numeric default null,
  p_temp_interna numeric default null,
  p_unid_finales numeric default null,
  p_unid_nc numeric default null,
  p_lote_empaque text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next text;
  v_now timestamptz := now();
  v_detalle jsonb;
begin
  if not exists(select 1 from mes_lotes_activos where id_lote = p_id_lote) then
    return jsonb_build_object('status','error','message','Lote no encontrado en activos.');
  end if;

  v_next := mes_next_etapa(p_etapa);
  v_detalle := jsonb_build_object(
    'cantidad', p_cantidad,
    'temp_amb', p_temp_amb,
    'hum_amb', p_hum_amb,
    'obs', p_obs,
    'rows', coalesce(p_rows,'[]'::jsonb),
    'peso_unidad', p_peso_unidad,
    'num_porciones', p_num_porciones,
    'num_latas', p_num_latas,
    'unid_por_lata', p_unid_por_lata,
    'materias_decorado', coalesce(p_materias_decorado,'[]'::jsonb),
    'temp_horno', p_temp_horno,
    'tiempo_horno', p_tiempo_horno,
    'temp_interna', p_temp_interna,
    'unid_finales', p_unid_finales,
    'unid_nc', p_unid_nc,
    'lote_empaque', p_lote_empaque
  );

  insert into mes_bitacora_detalle(
    id_lote, slot, etapa, producto_id, pin, operario, detalle_json, total_gramos_masa
  )
  values(
    p_id_lote, p_slot, p_etapa, p_producto_id, p_pin, p_operario, v_detalle, coalesce(p_total_gramos_masa,0)
  );

  insert into mes_bitacora(id_lote, slot, etapa, pin, operario, timestamp_registro, datos_json)
  values(p_id_lote, p_slot, p_etapa, p_pin, p_operario, v_now, v_detalle);

  if v_next = 'Finalizado' then
    insert into mes_bitacora(id_lote, slot, etapa, pin, operario, timestamp_registro, datos_json)
    values(p_id_lote, p_slot, 'Finalizado', p_pin, p_operario, v_now, '{}'::jsonb);

    delete from mes_lotes_activos where id_lote = p_id_lote;
    return jsonb_build_object('status','ok','message','Lote finalizado.','finalizado',true);
  end if;

  update mes_lotes_activos
  set etapa_actual = v_next,
      operario = p_operario,
      hora_etapa = v_now,
      datos_json = v_detalle
  where id_lote = p_id_lote;

  return jsonb_build_object(
    'status','ok',
    'etapa_anterior', p_etapa,
    'etapa_siguiente', v_next,
    'message', 'Etapa actualizada.'
  );
end;
$$;

-- =========================
-- Permisos RPC para anon/authenticated
-- =========================
grant usage on schema public to anon, authenticated;
grant execute on function get_productos() to anon, authenticated;
grant execute on function get_bootstrap() to anon, authenticated;
grant execute on function get_all_activos() to anon, authenticated;
grant execute on function get_lote_estado(text) to anon, authenticated;
grant execute on function iniciar_lote(integer, text, numeric, numeric, numeric, text, text, text) to anon, authenticated;
grant execute on function pre_guardar_etapa(text, integer, text, text, text, text, numeric, numeric, numeric, text, jsonb, numeric, numeric, numeric, numeric, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, text) to anon, authenticated;
grant execute on function pasar_etapa_desde_modal(text, integer, text, text, text, text, numeric, numeric, numeric, text, jsonb, numeric, numeric, numeric, numeric, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, text) to anon, authenticated;

