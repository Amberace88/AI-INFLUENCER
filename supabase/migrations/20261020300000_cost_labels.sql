-- Action names in the same language as the app UI
update public.generation_costs set label = v.label from (values
  ('image_fast',   'Quick sketch'),
  ('image_ref',    'Photo with the persona''s face'),
  ('image_sd',     'Local photo (ComfyUI)'),
  ('image_hd',     'Local photo, HD (ComfyUI)'),
  ('text_persona', 'AI writes a persona'),
  ('text_posts',   'AI writes posts')
) as v(kind, label) where generation_costs.kind = v.kind;
