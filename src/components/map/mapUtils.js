export const fmtMin = (min, t) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? t('map.leg.hm', { h, m }) : t('map.leg.m', { m })
}
