// =====================================================================
//  FURNIPART — sayt sozlamalari
//  Firebase loyihasi ochilgach, firebaseConfig ichidagi qiymatlarni
//  Firebase Console → Project settings → Your apps → Web app'dan oling.
// =====================================================================

export const firebaseConfig = {
  apiKey: "TODO",
  authDomain: "TODO.firebaseapp.com",
  projectId: "TODO",
  storageBucket: "TODO.appspot.com",
  messagingSenderId: "TODO",
  appId: "TODO",
};

// Admin panelga kira oladigan email(lar). firestore.rules faylida ham shu email turishi shart.
export const ADMIN_EMAILS = ["TODO@gmail.com"];

export const SHOP = {
  name: "FURNIPART",
  tagline: "premium",
  phone: "+998 91 125 9000",
  phoneHref: "tel:+998911259000",
  instagram: "https://instagram.com/furnipart.uz",
  telegram: "https://t.me/Furnipart_uz",
  address:
    "Farg'ona viloyati, Marg'ilon shahri, Marg'ilon Sitiy ro'parasida (Marg'ilon aylanmasi, Sto Tex yonida)",
  delivery: "O'zbekiston bo'ylab dastavka bor",
};

// Kategoriyalar. "id" — bazada saqlanadigan qisqa nom, uni o'zgartirmang.
export const CATEGORIES = [
  { id: "garderob", label: "Garderob mexanizmlar", keys: ["garderob", "гардероб"] },
  { id: "oshxona", label: "Oshxona mexanizmlar", keys: ["oshxona", "ошхона", "kuxn", "кухн"] },
  { id: "divan", label: "Divanlar", keys: ["divan", "диван"] },
  { id: "matras", label: "Matraslar", keys: ["matras", "матрас"] },
  { id: "shablon", label: "Shablonlar", keys: ["shablon", "шаблон"] },
];
