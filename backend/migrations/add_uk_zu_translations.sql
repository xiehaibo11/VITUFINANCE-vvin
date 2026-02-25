-- 添加乌克兰语(uk)和祖鲁语(zu)翻译
-- 日期: 2026-02-25

-- 公告 1: Welcome to Vitu Finance
UPDATE announcements SET
title_translations = JSON_SET(
  title_translations,
  '$.uk', 'Ласкаво просимо до Vitu Finance! Розпочніть свою криптоподорож з AI.',
  '$.zu', 'Siyakwamukela ku-Vitu Finance! Qala uhambo lwakho lwe-crypto nge-AI.'
),
content_translations = JSON_SET(
  content_translations,
  '$.uk', 'Ласкаво просимо до Vitu Finance! Ми є провідною платформою торгівлі криптовалютою на основі штучного інтелекту, розробленою для максимізації вашої інвестиційної прибутковості. Наші передові алгоритми цілодобово аналізують ринкові тенденції, щоб надати вам найкращі торгові можливості.',
  '$.zu', 'Siyakwamukela ku-Vitu Finance! Siyinkundla ehamba phambili yokuhweba i-cryptocurrency esekelwe nge-AI, eyenzelwe ukukusiza ukwandisa ukubuyisela kwakho kokutshala imali. Ama-algorithms ethu athuthukile ahlaziya izitayela zomakethe imini nobusuku ukuze akunikeze amathuba amahle kakhulu okuhweba.'
)
WHERE id = 1;

-- 公告 2: Worldcoin WLD Staking
UPDATE announcements SET
title_translations = JSON_SET(
  title_translations,
  '$.uk', 'Переваги стейкінгу Worldcoin WLD',
  '$.zu', 'Izinzuzo Zokubeka i-Worldcoin WLD'
),
content_translations = JSON_SET(
  content_translations,
  '$.uk', 'Worldcoin прагне забезпечити універсальний доступ до світової економіки, незалежно від вашої країни чи походження. Стейкайте свої токени WLD для отримання пасивного доходу, одночасно підтримуючи мережу.',
  '$.zu', 'I-Worldcoin ihlose ukunikeza ukufinyelela okuvulelekile emnotsweni yomhlaba, kungakhathaliseki ukuthi uvela kuliphi izwe noma yisiphi isizinda sakho. Beka ama-token akho e-WLD ukuze uthole imali engenayo ngokuzenzakalelayo ngenkathi usekela inethiwekhi.'
)
WHERE id = 2;

-- 公告 3: AI Robot Trading Guide
UPDATE announcements SET
title_translations = JSON_SET(
  title_translations,
  '$.uk', 'Посібник з торгівлі AI-роботом',
  '$.zu', 'Umhlahlandlela Wokuhweba Nge-Robot ye-AI'
),
content_translations = JSON_SET(
  content_translations,
  '$.uk', 'Наші AI-роботи працюють, аналізуючи ринкові дані, визначаючи тенденції та автоматично виконуючи угоди. Виберіть з різних стратегій, включаючи сіткову торгівлю, високочастотну торгівлю та інші, відповідно до вашої толерантності до ризику.',
  '$.zu', 'Ama-robot ethu e-AI asebenza ngokuhlaziya idatha yemakethe, akhombe izitayela, futhi enze ukuhweba ngokuzenzakalelayo. Khetha phakathi kwamasu ahlukene kufaka phakathi i-Grid Trading, i-High-Frequency Trading, nokuningi ukuze kuhambisane nokubekezelela kwakho ubungozi.'
)
WHERE id = 3;

-- 公告 4: Grid Trading & High-Frequency Trading
UPDATE announcements SET
title_translations = JSON_SET(
  title_translations,
  '$.uk', 'Сіткова торгівля та високочастотна торгівля',
  '$.zu', 'I-Grid Trading ne-High-Frequency Trading'
),
content_translations = JSON_SET(
  content_translations,
  '$.uk', 'Сіткова торгівля створює сітку ордерів на купівлю та продаж з заздалегідь визначеними ціновими інтервалами, отримуючи прибуток від волатильності ринку. Високочастотна торгівля використовує передові алгоритми для виконання тисяч угод на день, фіксуючи невеликі рухи цін.',
  '$.zu', 'I-Grid Trading idala igridi yemiyalo yokuthenga nokuthengisa ezigabeni zamanani ezinqunyiwe ngaphambili, yenzuze ngokushintshashintsha kwemakethe. I-High-Frequency Trading isebenzisa ama-algorithms athuthukile ukwenza izinkulungwane zokuhweba ngosuku, ibambe ukushukuma okuncane kwamanani.'
)
WHERE id = 4;

-- 公告 5: Referral Program
UPDATE announcements SET
title_translations = JSON_SET(
  title_translations,
  '$.uk', 'Реферальна програма - Заробляйте, поширюючи',
  '$.zu', 'Uhlelo Lokuxhuma - Hola Ngenkathi Wabelana'
),
content_translations = JSON_SET(
  content_translations,
  '$.uk', 'Приєднуйтесь до нашої реферальної програми та заробляйте до 10 рівнів винагород! Поділіться своїм унікальним реферальним кодом з друзями та родиною. Ви заробите комісію від їхньої торгової діяльності. Чим більше у вас активних рефералів, тим більше ви заробляєте!',
  '$.zu', 'Joyina uhlelo lwethu lokuxhuma futhi uhole izinga elingafinyelela ku-10 lemiklomelo! Yabelana ngekhodi yakho eyingqayizivele yokuxhuma nabangane nomndeni. Uzohola ikhomishini emisebenzini yabo yokuhweba. Uma unokuxhunywa okuningi okusebenzayo, kuhle kakhulu owenza!'
)
WHERE id = 5;

-- 公告 6: 多账号违规公告
UPDATE announcements SET
title_translations = JSON_SET(
  title_translations,
  '$.uk', 'Повідомлення: Суворі заходи проти порушень з кількома обліковими записами',
  '$.zu', 'Isaziso: Isinyathelo Esilukhuni Ngokumelene Nokuphulwa Kwama-akhawunti Amaningi'
),
content_translations = JSON_SET(
  content_translations,
  '$.uk', 'Шановні користувачі: Наша система нещодавно виявила деяких користувачів, які займаються шахрайською діяльністю, такою як реєстрація кількох облікових записів для зловмисного отримання реферальних винагород. Така поведінка серйозно порушує нормальну роботу нашої платформи. Після виявлення ми вживемо суворих заходів, включаючи, але не обмежуючись, вилучення незаконних винагород та заборону пов\'язаних облікових записів. Будь ласка, допоможіть нам підтримувати справедливе та відповідне середовище спільноти. Дякуємо за вашу підтримку та співпрацю.',
  '$.zu', 'Basebenzisi Abathandekayo: Isistimu yethu isanda kubona abanye abasebenzisi abenza izenzo zokukhwabanisa ezifana nokubhalisa ama-akhawunti amaningi ukuthola imiklomelo yokuxhuma ngendlela embi. Ukuziphatha okunjalo kuphazamisa kakhulu ukusebenza okuvamile kwenkundla yethu. Uma kuye kwatholakala, sizothatha izinyathelo ezinzima ezifaka phakathi kodwa ezingagcini ekuthatheni imiklomelo engekho emthethweni nokuvimba ama-akhawunti ahlobene. Sicela usisize ukugcina imvelo yomphakathi enobulungisa ehambisana nemithetho. Siyabonga ngokusekela nokusebenzisana kwakho.'
)
WHERE id = 6;
