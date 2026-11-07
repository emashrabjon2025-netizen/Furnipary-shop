// Farg'ona viloyati: shahar va tumanlar (manzil matnidan aniqlanadi)
export const AREAS = [
  ["Marg'ilon", /marg.?i?lon|маргилан|марғилон/i],
  ["Farg'ona sh.", /farg.?ona\s*(sh|shah)|фергана|фарғона\s*ш|^farg.?ona$/i],
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
export const areaOf = (s) => {
  const a = String(s.address || "") + " " + String(s.region || "");
  const hit = AREAS.find(([, re]) => re.test(a));
  return hit ? hit[0] : "Boshqa";
};
