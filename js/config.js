// =====================================================================
//  FURNIPART — sayt sozlamalari
//  Firebase loyihasi ochilgach, firebaseConfig ichidagi qiymatlarni
//  Firebase Console → Project settings → Your apps → Web app'dan oling.
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDrbB7ppT6vSccAl1CLMdVhcmzg7Tyj1zU",
  authDomain: "furbipart.firebaseapp.com",
  projectId: "furbipart",
  storageBucket: "furbipart.firebasestorage.app",
  messagingSenderId: "47886344973",
  appId: "1:47886344973:web:fe31d5cc3ae69aef630644",
};

// Admin panelga kira oladigan akkaunt(lar) UID'si (Firebase → Authentication → Users).
// firestore.rules faylida ham shu UID turishi shart.
export const ADMIN_UIDS = ["B3O0Gn3vA3al6kmBZw5porxAEXC3"];

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
