/* ==========================================================================
   BONJOUR CRUISE, i18n content model
   One source of truth for every language. Edit a string here and the build
   generator (scripts/build-i18n.mjs) re-stamps /fr /ar /ru /zh from it.

   - `LANGS`   : the languages we ship. `en` lives at the site root, the rest
                 in their own folder. `rtl` flips the document direction.
   - `GLOBAL`  : chrome shared by every page (nav, footer, WhatsApp).
   - `PAGES`   : per-page copy + SEO, keyed by the built HTML file name.

   Brand name "Bonjour Cruise" is never translated. Translations are strong
   working copy; a native speaker pass before a big paid push is worth it for
   a premium brand (Arabic/Chinese especially).
   ========================================================================== */

export const SITE = 'https://bonjourcruise.com';

export const LANGS = [
  { code: 'en', dir: 'ltr', label: 'EN', htmlLang: 'en' },
  { code: 'fr', dir: 'ltr', label: 'FR', htmlLang: 'fr' },
  { code: 'ar', dir: 'rtl', label: 'AR', htmlLang: 'ar' },
  { code: 'ru', dir: 'ltr', label: 'RU', htmlLang: 'ru' },
  // Chinese ships as two scripts: Simplified (mainland/Baidu) and Traditional
  // (Taiwan/HK/Google). Explicit zh-Hans / zh-Hant so search engines serve the
  // right script per region. Folder for Traditional is /zh-hant/.
  { code: 'zh', dir: 'ltr', label: '简', htmlLang: 'zh-Hans' },
  { code: 'zh-hant', dir: 'ltr', label: '繁', htmlLang: 'zh-Hant' },
];

export const TARGET_LANGS = LANGS.filter((l) => l.code !== 'en');

// Extra webfonts for scripts our Latin stack does not cover. Injected only on
// the languages that need them, and mapped onto the CSS variables.
export const FONTS = {
  ar: {
    href: 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Sans+Arabic:wght@400;500;600&display=swap',
    css: `html[lang="ar"]{--serif:'Amiri',serif;--serif-2:'Amiri',serif;--sans:'Noto Sans Arabic',sans-serif;}html[lang="ar"] body{font-family:'Noto Sans Arabic',sans-serif;}`,
  },
  zh: {
    href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;600;700&family=Noto+Sans+SC:wght@400;500;600&display=swap',
    css: `html[lang="zh-Hans"]{--serif:'Noto Serif SC',serif;--serif-2:'Noto Serif SC',serif;--sans:'Noto Sans SC',sans-serif;}html[lang="zh-Hans"] body{font-family:'Noto Sans SC',sans-serif;}`,
  },
  'zh-hant': {
    href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;600;700&family=Noto+Sans+TC:wght@400;500;600&display=swap',
    css: `html[lang="zh-Hant"]{--serif:'Noto Serif TC',serif;--serif-2:'Noto Serif TC',serif;--sans:'Noto Sans TC',sans-serif;}html[lang="zh-Hant"] body{font-family:'Noto Sans TC',sans-serif;}`,
  },
};

/* --------------------------------------------------------------------------
   GLOBAL, shared chrome
   -------------------------------------------------------------------------- */

// Nav + footer link labels, keyed by the anchor's ORIGINAL href (before the
// generator rewrites links into the language folder).
export const NAV_LINKS = {
  '/discover.html':        { en: 'Discover',        fr: 'Découvrir',   ar: 'اكتشفي',              ru: 'Обзор',       zh: '探索' },
  '/cruises.html':         { en: 'Cruises',         fr: 'Croisières',  ar: 'الرحلات',             ru: 'Круизы',      zh: '航程' },
  '/experiences.html':     { en: 'Experiences',     fr: 'Expériences', ar: 'التجارب',             ru: 'Впечатления', zh: '体验' },
  '/privacy-promise.html': { en: 'Privacy Promise', fr: 'Notre promesse', ar: 'وعد الخصوصية',     ru: 'Приватность', zh: '隐私承诺' },
  '/contact.html':         { en: 'Contact',         fr: 'Contact',     ar: 'تواصلي',              ru: 'Контакты',    zh: '联系我们' },
  '/account.html':         { en: 'Account',         fr: 'Mon compte',  ar: 'حسابي',               ru: 'Аккаунт',     zh: '我的账户' },
  '/book.html':            { en: 'Book',            fr: 'Réserver',    ar: 'احجزي',               ru: 'Бронирование', zh: '预订' },
  '/blog.html':            { en: 'Journal',         fr: 'Journal',     ar: 'المجلة',              ru: 'Журнал',      zh: '日志' },
  '/privacy-policy.html':  { en: 'Privacy Policy',  fr: 'Politique de confidentialité', ar: 'سياسة الخصوصية', ru: 'Политика конфиденциальности', zh: '隐私政策' },
  '/terms.html':           { en: 'Terms & Conditions', fr: 'Conditions générales', ar: 'الشروط والأحكام', ru: 'Условия использования', zh: '条款与条件' },
};

// Selector + English-text replacements that appear across pages. Matched by
// exact trimmed text so each element maps to the right translation.
export const COMMON_TEXT = [
  { sel: 'a.nav-cta', en: 'Book your cruise',
    fr: 'Réserver', ar: 'احجزي رحلتك', ru: 'Забронировать', zh: '预订航程' },
  { sel: '.site-footer h4', en: 'Explore',
    fr: 'Explorer', ar: 'استكشفي', ru: 'Разделы', zh: '探索' },
  { sel: '.site-footer h4', en: 'Follow',
    fr: 'Suivez-nous', ar: 'تابعينا', ru: 'Мы в соцсетях', zh: '关注我们' },
  { sel: '.site-footer h4', en: 'Legal',
    fr: 'Mentions légales', ar: 'قانوني', ru: 'Правовая информация', zh: '法律' },
];

// Elements whose full inner HTML is replaced (keep embedded markup like spans).
export const COMMON_HTML = [
  {
    sel: '.footer-brand p',
    en: 'A social, by-the-seat yacht cruise brand in Dubai. Warm, vetted crew, halal dining on request. Come as one, leave with friends.',
    fr: 'Une marque de croisières en yacht partagées à Dubaï, réservables à la place. Équipage chaleureux et vérifié, halal sur demande. Venez seul, repartez entre amis.',
    ar: 'علامة رحلات يخوت جماعية في دبي، بالحجز حسب المقعد. طاقم ودود وموثوق، وطعام حلال عند الطلب. تعال بمفردك، وارجع بأصدقاء.',
    ru: 'Бренд групповых круизов на яхтах в Дубае с бронированием по месту. Дружелюбный проверенный экипаж, халяль по запросу. Приходите одни, уезжайте с друзьями.',
    zh: '迪拜按座位预订的共享游艇巡游品牌。热情可靠的船员，可提供清真餐。独自登船，结伴而归。',
  },
];

// The copyright line keeps a <span data-year> the runtime fills in.
export const COPYRIGHT = {
  fr: '&copy; <span data-year>2026</span> Bonjour Cruise. Tous droits réservés.',
  ar: '&copy; <span data-year>2026</span> Bonjour Cruise. جميع الحقوق محفوظة.',
  ru: '&copy; <span data-year>2026</span> Bonjour Cruise. Все права защищены.',
  zh: '&copy; <span data-year>2026</span> Bonjour Cruise. 版权所有。',
};

// WhatsApp float: aria label + the ?text= greeting (URL-encoded at build time).
export const WHATSAPP = {
  aria: {
    en: 'Chat with us on WhatsApp', fr: 'Discuter avec nous sur WhatsApp',
    ar: 'تحدثي معنا على واتساب', ru: 'Написать нам в WhatsApp', zh: '通过 WhatsApp 联系我们',
    'zh-hant': '透過 WhatsApp 聯絡我們',
  },
  text: {
    en: 'Hello Bonjour Cruise, I have a question about Bonjour Cruise.',
    fr: 'Bonjour Bonjour Cruise, j’ai une question.',
    ar: 'مرحبًا Bonjour Cruise، لدي سؤال.',
    ru: 'Здравствуйте, Bonjour Cruise, у меня вопрос.',
    zh: '你好 Bonjour Cruise，我有一个问题。',
    'zh-hant': '你好 Bonjour Cruise，我有一個問題。',
  },
};

/* --------------------------------------------------------------------------
   PAGES, per-page copy + SEO
   Each key is the built HTML file name. `seo` fills title/description/og.
   `text` / `html` are selector-scoped replacements for that page's body.
   -------------------------------------------------------------------------- */

export const PAGES = {
  'index.html': {
    path: '', // site root
    seo: {
      title: {
        fr: 'Bonjour Cruise, croisières en yacht à Dubaï | Réservez à la place, entre amis',
        ar: 'Bonjour Cruise، رحلات يخوت جماعية في دبي | احجز مقعدك وارجع بأصدقاء',
        ru: 'Bonjour Cruise, круизы на яхтах в Дубае | Приходите одни, уезжайте с друзьями',
        zh: 'Bonjour Cruise，迪拜共享游艇巡游 | 独自登船，结伴而归',
        'zh-hant': 'Bonjour Cruise，杜拜共享遊艇巡遊 | 獨自登船，結伴而歸',
      },
      description: {
        fr: 'Les croisières en yacht partagées de Dubaï, réservables à la place. Petits groupes, équipage chaleureux et vérifié, cuisine halal sur demande et partenaire maritime agréé. Venez seul, repartez entre amis.',
        ar: 'رحلات يخوت جماعية في دبي، بالحجز حسب المقعد. مجموعات صغيرة، طاقم ودود وموثوق، طعام حلال عند الطلب، وشريك بحري مرخّص. تعال بمفردك، وارجع بأصدقاء.',
        ru: 'Групповые круизы на яхтах в Дубае с бронированием по месту. Небольшие группы, дружелюбный проверенный экипаж, халяльная кухня по запросу и лицензированный морской партнёр. Приходите одни, уезжайте с друзьями.',
        zh: '迪拜按座位预订的共享游艇巡游。小型团体，热情可靠的船员，可提供清真餐饮，持牌海事合作伙伴。独自登船，结伴而归。',
        'zh-hant': '杜拜按座位預訂的共享遊艇巡遊。小型團體，熱情可靠的船員，可提供清真餐飲，持牌海事合作夥伴。獨自登船，結伴而歸。',
      },
      ogTitle: {
        fr: 'Bonjour Cruise, venez seul, repartez entre amis.',
        ar: 'Bonjour Cruise، تعال بمفردك، وارجع بأصدقاء.',
        ru: 'Bonjour Cruise, приходите одни, уезжайте с друзьями.',
        zh: 'Bonjour Cruise，独自登船，结伴而归。',
        'zh-hant': 'Bonjour Cruise，獨自登船，結伴而歸。',
      },
      ogDescription: {
        fr: 'Les croisières en yacht partagées de Dubaï, réservables à la place. Équipage chaleureux et vérifié, halal sur demande, partenaire maritime agréé.',
        ar: 'رحلات يخوت جماعية في دبي بالحجز حسب المقعد. طاقم ودود وموثوق، حلال عند الطلب، وشريك بحري مرخّص.',
        ru: 'Групповые круизы на яхтах в Дубае с бронированием по месту. Дружелюбный проверенный экипаж, халяль по запросу, лицензированный морской партнёр.',
        zh: '迪拜按座位预订的共享游艇巡游。热情可靠的船员，可提供清真餐，持牌海事合作伙伴。',
        'zh-hant': '杜拜按座位預訂的共享遊艇巡遊。熱情可靠的船員，可提供清真餐，持牌海事合作夥伴。',
      },
      ogImageAlt: {
        fr: 'Bonjour Cruise, croisières en yacht partagées à Dubaï',
        ar: 'Bonjour Cruise، رحلات يخوت جماعية في دبي',
        ru: 'Bonjour Cruise, групповые круизы на яхтах в Дубае',
        zh: 'Bonjour Cruise，迪拜共享游艇巡游',
        'zh-hant': 'Bonjour Cruise，杜拜共享遊艇巡遊',
      },
      jsonldDescription: {
        fr: 'Une marque de croisières en yacht partagées à Dubaï, réservables à la place, équipage chaleureux et vérifié, cuisine halal à bord.',
        ar: 'علامة رحلات يخوت جماعية في دبي، بالحجز حسب المقعد، طاقم ودود وموثوق، وطعام حلال على متنها.',
        ru: 'Бренд групповых круизов на яхтах в Дубае с бронированием по месту, дружелюбный проверенный экипаж и халяльная кухня на борту.',
        zh: '迪拜按座位预订的共享游艇巡游品牌，热情可靠的船员，船上提供清真餐饮。',
        'zh-hant': '杜拜按座位預訂的共享遊艇巡遊品牌，熱情可靠的船員，船上提供清真餐飲。',
      },
      slogan: {
        fr: 'Venez seul, repartez entre amis.', ar: 'تعال بمفردك، وارجع بأصدقاء.',
        ru: 'Приходите одни, уезжайте с друзьями.', zh: '独自登船，结伴而归。', 'zh-hant': '獨自登船，結伴而歸。',
      },
    },
    text: [
      { sel: '.wizard-hero .eyebrow', en: 'Shared yacht cruises, Dubai',
        fr: 'Croisières partagées en yacht, Dubaï', ar: 'رحلات يخوت جماعية، دبي',
        ru: 'Групповые круизы на яхтах, Дубай', zh: '共享游艇巡游，迪拜' },
      { sel: '.wizard-hero h1', en: 'Come as one, leave with friends.',
        fr: 'Venez seul, repartez entre amis.', ar: 'تعال بمفردك، وارجع بأصدقاء.',
        ru: 'Приходите одни, уезжайте с друзьями.', zh: '独自登船，结伴而归。' },
    ],
  },
};
