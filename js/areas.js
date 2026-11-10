// Farg'ona viloyati: shahar va tumanlar (manzil matnidan aniqlanadi)
export const AREAS = [
  ["Marg'ilon", /marg.?i?lon|маргилан|марғилон/i],
  ["Farg'ona sh.", /farg.?ona\s*(sh|shah)|фергана|фарғона\s*ш|^\s*farg.?ona\s*(,|$)/i],
  ["Qo'qon", /qo.?qon|kokand|коканд|қўқон/i],
  ["Quvasoy", /quvasoy|кувасай|қувасой/i],
  ["Toshloq", /toshloq|ташлак|тошлоқ/i],
  ["Oltiariq", /oltiariq|алтыарык|олтиариқ/i],
  ["Rishton", /rishton|риштан|риштон/i],
  ["Beshariq", /beshariq|бешарык|бешариқ/i],
  ["Bag'dod", /bag.?dod|багдад|бағдод/i],
  ["Buvayda", /buvayda|бувайда/i],
  ["Dang'ara", /dang.?ara|дангара|данғара/i],
  ["Furqat", /furqat|фуркат|фурқат/i],
  ["Qo'shtepa", /qo.?shtepa|куштепа|қўштепа/i],
  ["Quva", /\bquva\b|кува\b|қува\b/i],
  ["Uchko'prik", /uchko.?prik|учкуприк|учкўприк/i],
  ["Yozyovon", /yozyovon|язъяван|ёзёвон/i],
  ["So'x", /\bso.?x\b|сох|сўх/i],
  ["O'zbekiston t.", /o.?zbekiston\s*t|узбекистанский|ўзбекистон\s*т/i],
  ["Farg'ona t.", /farg.?ona\s*t(um|\.)|ферганский|фарғона\s*т/i],
];
// Qo'shimcha (qo'lda qo'shilgan) shaharlar: [{ name, keys: ["so'z", ...] }] — crmSettings/cities
const norm = (x) => String(x || "").toLowerCase().replace(/[ʻʼ'`‘’]/g, "").replace(/\s+/g, " ");
let custom = [];
export const setCustomAreas = (list) => (custom = Array.isArray(list) ? list.filter((c) => c && c.name) : []);
export const customAreas = () => custom;
export const allAreaNames = () => [...AREAS.map(([n]) => n), ...custom.map((c) => c.name).filter((n) => !AREAS.some(([a]) => a === n))];

export const areaOf = (s) => {
  if (s.area) return s.area;
  const a = String(s.address || "") + " " + String(s.region || "");
  const na = norm(a);
  const c = custom.find((x) => [x.name, ...(x.keys || [])].some((k) => norm(k).length > 1 && na.includes(norm(k))));
  if (c) return c.name;
  const hit = AREAS.find(([, re]) => re.test(a));
  return hit ? hit[0] : "Boshqa";
};
