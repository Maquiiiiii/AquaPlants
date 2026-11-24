const KNOWN_LABELS: Record<string, string> = {
  consumo_hidrico: 'Consumo hídrico',
  caudal: 'Caudal',
  nutrientes: 'Nutrientes',
  fotoperiodo: 'Fotoperiodo',
  en_linea: 'En línea',
  fuera_de_linea: 'Fuera de línea',
  mantenimiento: 'Mantenimiento',
  umbral_min: 'Mínimo permitido',
  umbral_max: 'Máximo permitido',
};

export function formatVariableLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return '';
  if (KNOWN_LABELS[key]) {
    return KNOWN_LABELS[key];
  }
  const spaced = raw.trim().replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
