-- 更新公告多语言翻译数据
-- 日期: 2026-02-25

-- 公告 1: Welcome to Vitu Finance
UPDATE announcements SET
title_translations = JSON_OBJECT(
  'en', 'Welcome to Vitu Finance! Start your AI-powered crypto journey.',
  'zh-tw', '歡迎來到 Vitu Finance！開啟您的 AI 加密貨幣之旅。',
  'es', '¡Bienvenido a Vitu Finance! Comienza tu viaje cripto con IA.',
  'fr', 'Bienvenue sur Vitu Finance ! Commencez votre voyage crypto avec IA.',
  'de', 'Willkommen bei Vitu Finance! Starten Sie Ihre KI-gestützte Krypto-Reise.',
  'ar', 'مرحباً بك في Vitu Finance! ابدأ رحلتك في العملات المشفرة بالذكاء الاصطناعي.',
  'pt', 'Bem-vindo ao Vitu Finance! Comece sua jornada cripto com IA.',
  'it', 'Benvenuto su Vitu Finance! Inizia il tuo viaggio cripto con IA.',
  'tr', 'Vitu Finance\'e hoş geldiniz! AI destekli kripto yolculuğunuza başlayın.',
  'vi', 'Chào mừng đến với Vitu Finance! Bắt đầu hành trình crypto với AI.',
  'id', 'Selamat datang di Vitu Finance! Mulai perjalanan crypto Anda dengan AI.',
  'ms', 'Selamat datang ke Vitu Finance! Mulakan perjalanan crypto anda dengan AI.'
),
content_translations = JSON_OBJECT(
  'en', 'Welcome to Vitu Finance! We are a leading AI-powered cryptocurrency trading platform designed to help you maximize your investment returns. Our advanced algorithms analyze market trends 24/7 to provide you with the best trading opportunities.',
  'zh-tw', '歡迎來到 Vitu Finance！我們是領先的 AI 驅動加密貨幣交易平台，旨在幫助您最大化投資回報。我們的先進算法全天候分析市場趨勢，為您提供最佳交易機會。',
  'es', '¡Bienvenido a Vitu Finance! Somos una plataforma líder de trading de criptomonedas impulsada por IA, diseñada para ayudarte a maximizar tus retornos de inversión. Nuestros algoritmos avanzados analizan las tendencias del mercado 24/7.',
  'fr', 'Bienvenue sur Vitu Finance ! Nous sommes une plateforme leader de trading de cryptomonnaies alimentée par l\'IA, conçue pour vous aider à maximiser vos retours sur investissement. Nos algorithmes avancés analysent les tendances du marché 24h/24.',
  'de', 'Willkommen bei Vitu Finance! Wir sind eine führende KI-gestützte Kryptowährungs-Handelsplattform, die entwickelt wurde, um Ihre Anlagerenditen zu maximieren. Unsere fortschrittlichen Algorithmen analysieren 24/7 Markttrends.',
  'ar', 'مرحباً بك في Vitu Finance! نحن منصة تداول عملات مشفرة رائدة مدعومة بالذكاء الاصطناعي، مصممة لمساعدتك على تعظيم عوائد استثمارك. تحلل خوارزمياتنا المتقدمة اتجاهات السوق على مدار الساعة.',
  'pt', 'Bem-vindo ao Vitu Finance! Somos uma plataforma líder de negociação de criptomoedas alimentada por IA, projetada para ajudá-lo a maximizar seus retornos de investimento. Nossos algoritmos avançados analisam tendências de mercado 24/7.',
  'it', 'Benvenuto su Vitu Finance! Siamo una piattaforma leader di trading di criptovalute alimentata dall\'IA, progettata per aiutarti a massimizzare i tuoi rendimenti di investimento. I nostri algoritmi avanzati analizzano le tendenze di mercato 24/7.',
  'tr', 'Vitu Finance\'e hoş geldiniz! Yatırım getirilerinizi maksimize etmenize yardımcı olmak için tasarlanmış, AI destekli önde gelen bir kripto para ticaret platformuyuz. Gelişmiş algoritmalarımız piyasa trendlerini 7/24 analiz eder.',
  'vi', 'Chào mừng đến với Vitu Finance! Chúng tôi là nền tảng giao dịch tiền điện tử hàng đầu được hỗ trợ bởi AI, được thiết kế để giúp bạn tối đa hóa lợi nhuận đầu tư. Các thuật toán tiên tiến của chúng tôi phân tích xu hướng thị trường 24/7.',
  'id', 'Selamat datang di Vitu Finance! Kami adalah platform trading cryptocurrency terkemuka yang didukung AI, dirancang untuk membantu Anda memaksimalkan pengembalian investasi. Algoritma canggih kami menganalisis tren pasar 24/7.',
  'ms', 'Selamat datang ke Vitu Finance! Kami adalah platform dagangan cryptocurrency terkemuka yang dikuasakan AI, direka untuk membantu anda memaksimumkan pulangan pelaburan. Algoritma canggih kami menganalisis trend pasaran 24/7.'
)
WHERE id = 1;

-- 公告 2: Worldcoin WLD Staking
UPDATE announcements SET
title_translations = JSON_OBJECT(
  'en', 'Worldcoin WLD Staking Benefits',
  'zh-tw', 'Worldcoin WLD 質押收益',
  'es', 'Beneficios de Staking de Worldcoin WLD',
  'fr', 'Avantages du Staking Worldcoin WLD',
  'de', 'Worldcoin WLD Staking-Vorteile',
  'ar', 'فوائد تخزين Worldcoin WLD',
  'pt', 'Benefícios de Staking Worldcoin WLD',
  'it', 'Vantaggi dello Staking Worldcoin WLD',
  'tr', 'Worldcoin WLD Stake Avantajları',
  'vi', 'Lợi ích Staking Worldcoin WLD',
  'id', 'Manfaat Staking Worldcoin WLD',
  'ms', 'Faedah Staking Worldcoin WLD'
),
content_translations = JSON_OBJECT(
  'en', 'Worldcoin aims to provide universal access to the global economy, no matter what country you are from or what your background is. Stake your WLD tokens to earn passive income while supporting the network.',
  'zh-tw', 'Worldcoin 旨在為全球經濟提供普遍訪問權，無論您來自哪個國家或背景如何。質押您的 WLD 代幣以賺取被動收入，同時支持網絡。',
  'es', 'Worldcoin tiene como objetivo proporcionar acceso universal a la economía global, sin importar de qué país seas o cuál sea tu origen. Haz staking de tus tokens WLD para obtener ingresos pasivos mientras apoyas la red.',
  'fr', 'Worldcoin vise à fournir un accès universel à l\'économie mondiale, peu importe votre pays ou votre origine. Stakez vos tokens WLD pour gagner un revenu passif tout en soutenant le réseau.',
  'de', 'Worldcoin zielt darauf ab, universellen Zugang zur globalen Wirtschaft zu bieten, unabhängig von Ihrem Land oder Hintergrund. Staken Sie Ihre WLD-Token, um passives Einkommen zu erzielen und gleichzeitig das Netzwerk zu unterstützen.',
  'ar', 'يهدف Worldcoin إلى توفير وصول عالمي للاقتصاد العالمي، بغض النظر عن بلدك أو خلفيتك. قم بتخزين رموز WLD الخاصة بك لكسب دخل سلبي مع دعم الشبكة.',
  'pt', 'Worldcoin visa fornecer acesso universal à economia global, não importa de qual país você seja ou qual seja sua origem. Faça staking de seus tokens WLD para obter renda passiva enquanto apoia a rede.',
  'it', 'Worldcoin mira a fornire accesso universale all\'economia globale, indipendentemente dal tuo paese o background. Fai staking dei tuoi token WLD per guadagnare reddito passivo supportando la rete.',
  'tr', 'Worldcoin, hangi ülkeden geldiğiniz veya geçmişiniz ne olursa olsun küresel ekonomiye evrensel erişim sağlamayı amaçlar. Ağı desteklerken pasif gelir elde etmek için WLD tokenlerinizi stake edin.',
  'vi', 'Worldcoin nhằm cung cấp quyền truy cập toàn cầu vào nền kinh tế toàn cầu, bất kể bạn đến từ quốc gia nào hoặc xuất thân của bạn. Stake token WLD của bạn để kiếm thu nhập thụ động trong khi hỗ trợ mạng lưới.',
  'id', 'Worldcoin bertujuan menyediakan akses universal ke ekonomi global, tidak peduli dari negara mana Anda berasal atau latar belakang Anda. Stake token WLD Anda untuk mendapatkan pendapatan pasif sambil mendukung jaringan.',
  'ms', 'Worldcoin bertujuan untuk menyediakan akses sejagat kepada ekonomi global, tidak kira dari negara mana anda atau latar belakang anda. Stake token WLD anda untuk mendapat pendapatan pasif sambil menyokong rangkaian.'
)
WHERE id = 2;

-- 公告 3: AI Robot Trading Guide
UPDATE announcements SET
title_translations = JSON_OBJECT(
  'en', 'AI Robot Trading Guide',
  'zh-tw', 'AI 機器人交易指南',
  'es', 'Guía de Trading con Robot IA',
  'fr', 'Guide du Trading avec Robot IA',
  'de', 'KI-Roboter-Trading-Leitfaden',
  'ar', 'دليل التداول بروبوت الذكاء الاصطناعي',
  'pt', 'Guia de Trading com Robô IA',
  'it', 'Guida al Trading con Robot IA',
  'tr', 'AI Robot Ticaret Rehberi',
  'vi', 'Hướng dẫn Giao dịch Robot AI',
  'id', 'Panduan Trading Robot AI',
  'ms', 'Panduan Dagangan Robot AI'
),
content_translations = JSON_OBJECT(
  'en', 'Our AI Robots work by analyzing market data, identifying trends, and executing trades automatically. Choose from various strategies including Grid Trading, High-Frequency Trading, and more to match your risk tolerance.',
  'zh-tw', '我們的 AI 機器人通過分析市場數據、識別趨勢並自動執行交易來工作。從網格交易、高頻交易等各種策略中選擇，以匹配您的風險承受能力。',
  'es', 'Nuestros Robots IA funcionan analizando datos del mercado, identificando tendencias y ejecutando operaciones automáticamente. Elija entre varias estrategias, incluido Grid Trading, Trading de Alta Frecuencia y más, para adaptarse a su tolerancia al riesgo.',
  'fr', 'Nos Robots IA fonctionnent en analysant les données du marché, en identifiant les tendances et en exécutant des transactions automatiquement. Choisissez parmi diverses stratégies, notamment Grid Trading, Trading Haute Fréquence, et plus encore pour correspondre à votre tolérance au risque.',
  'de', 'Unsere KI-Roboter arbeiten, indem sie Marktdaten analysieren, Trends identifizieren und Trades automatisch ausführen. Wählen Sie aus verschiedenen Strategien wie Grid Trading, Hochfrequenzhandel und mehr, um Ihrer Risikotoleranz zu entsprechen.',
  'ar', 'تعمل روبوتات الذكاء الاصطناعي لدينا من خلال تحليل بيانات السوق وتحديد الاتجاهات وتنفيذ الصفقات تلقائياً. اختر من بين استراتيجيات مختلفة بما في ذلك التداول الشبكي والتداول عالي التردد والمزيد لتتناسب مع قدرتك على تحمل المخاطر.',
  'pt', 'Nossos Robôs IA funcionam analisando dados de mercado, identificando tendências e executando negociações automaticamente. Escolha entre várias estratégias, incluindo Grid Trading, Trading de Alta Frequência e mais, para corresponder à sua tolerância ao risco.',
  'it', 'I nostri Robot IA funzionano analizzando i dati di mercato, identificando le tendenze ed eseguendo operazioni automaticamente. Scegli tra varie strategie tra cui Grid Trading, Trading ad Alta Frequenza e altro per adattarsi alla tua tolleranza al rischio.',
  'tr', 'AI Robotlarımız piyasa verilerini analiz ederek, trendleri belirleyerek ve işlemleri otomatik olarak gerçekleştirerek çalışır. Risk toleransınıza uygun Grid Trading, Yüksek Frekanslı Trading ve daha fazlası dahil çeşitli stratejiler arasından seçim yapın.',
  'vi', 'Các Robot AI của chúng tôi hoạt động bằng cách phân tích dữ liệu thị trường, xác định xu hướng và thực hiện giao dịch tự động. Chọn từ các chiến lược khác nhau bao gồm Grid Trading, High-Frequency Trading và nhiều hơn nữa để phù hợp với khả năng chấp nhận rủi ro của bạn.',
  'id', 'Robot AI kami bekerja dengan menganalisis data pasar, mengidentifikasi tren, dan mengeksekusi perdagangan secara otomatis. Pilih dari berbagai strategi termasuk Grid Trading, High-Frequency Trading, dan lainnya untuk menyesuaikan toleransi risiko Anda.',
  'ms', 'Robot AI kami berfungsi dengan menganalisis data pasaran, mengenal pasti trend, dan melaksanakan dagangan secara automatik. Pilih daripada pelbagai strategi termasuk Grid Trading, High-Frequency Trading, dan lagi untuk menyesuaikan toleransi risiko anda.'
)
WHERE id = 3;

-- 公告 4: Grid Trading & High-Frequency Trading
UPDATE announcements SET
title_translations = JSON_OBJECT(
  'en', 'Grid Trading & High-Frequency Trading',
  'zh-tw', '網格交易與高頻交易',
  'es', 'Grid Trading y Trading de Alta Frecuencia',
  'fr', 'Grid Trading et Trading Haute Fréquence',
  'de', 'Grid Trading & Hochfrequenzhandel',
  'ar', 'التداول الشبكي والتداول عالي التردد',
  'pt', 'Grid Trading e Trading de Alta Frequência',
  'it', 'Grid Trading e Trading ad Alta Frequenza',
  'tr', 'Grid Trading ve Yüksek Frekanslı Trading',
  'vi', 'Grid Trading & High-Frequency Trading',
  'id', 'Grid Trading & High-Frequency Trading',
  'ms', 'Grid Trading & High-Frequency Trading'
),
content_translations = JSON_OBJECT(
  'en', 'Grid Trading creates a grid of buy and sell orders at predetermined price intervals, profiting from market volatility. High-Frequency Trading uses advanced algorithms to execute thousands of trades per day, capturing small price movements.',
  'zh-tw', '網格交易在預定的價格區間內創建買賣訂單網格，從市場波動中獲利。高頻交易使用先進算法每天執行數千筆交易，捕捉小幅價格波動。',
  'es', 'Grid Trading crea una cuadrícula de órdenes de compra y venta en intervalos de precios predeterminados, obteniendo ganancias de la volatilidad del mercado. Trading de Alta Frecuencia utiliza algoritmos avanzados para ejecutar miles de operaciones por día, capturando pequeños movimientos de precios.',
  'fr', 'Le Grid Trading crée une grille d\'ordres d\'achat et de vente à des intervalles de prix prédéterminés, profitant de la volatilité du marché. Le Trading Haute Fréquence utilise des algorithmes avancés pour exécuter des milliers de transactions par jour, capturant de petits mouvements de prix.',
  'de', 'Grid Trading erstellt ein Netz von Kauf- und Verkaufsaufträgen in vorbestimmten Preisintervallen und profitiert von Marktvolatilität. Hochfrequenzhandel verwendet fortschrittliche Algorithmen, um täglich Tausende von Trades auszuführen und kleine Preisbewegungen zu erfassen.',
  'ar', 'يُنشئ التداول الشبكي شبكة من أوامر الشراء والبيع على فترات سعرية محددة مسبقاً، مستفيداً من تقلبات السوق. يستخدم التداول عالي التردد خوارزميات متقدمة لتنفيذ آلاف الصفقات يومياً، لالتقاط تحركات الأسعار الصغيرة.',
  'pt', 'Grid Trading cria uma grade de ordens de compra e venda em intervalos de preços predeterminados, lucrando com a volatilidade do mercado. Trading de Alta Frequência usa algoritmos avançados para executar milhares de negociações por dia, capturando pequenos movimentos de preços.',
  'it', 'Il Grid Trading crea una griglia di ordini di acquisto e vendita a intervalli di prezzo predeterminati, traendo profitto dalla volatilità del mercato. Il Trading ad Alta Frequenza utilizza algoritmi avanzati per eseguire migliaia di operazioni al giorno, catturando piccoli movimenti di prezzo.',
  'tr', 'Grid Trading, önceden belirlenmiş fiyat aralıklarında alım-satım emirlerinden oluşan bir ağ oluşturarak piyasa oynaklığından kar elde eder. Yüksek Frekanslı Trading, küçük fiyat hareketlerini yakalamak için günde binlerce işlem gerçekleştiren gelişmiş algoritmalar kullanır.',
  'vi', 'Grid Trading tạo một lưới các lệnh mua và bán ở các khoảng giá xác định trước, thu lợi từ biến động thị trường. High-Frequency Trading sử dụng các thuật toán tiên tiến để thực hiện hàng nghìn giao dịch mỗi ngày, nắm bắt các biến động giá nhỏ.',
  'id', 'Grid Trading menciptakan jaringan pesanan beli dan jual pada interval harga yang telah ditentukan, mengambil keuntungan dari volatilitas pasar. High-Frequency Trading menggunakan algoritma canggih untuk mengeksekusi ribuan perdagangan per hari, menangkap pergerakan harga kecil.',
  'ms', 'Grid Trading mencipta grid pesanan beli dan jual pada selang harga yang telah ditentukan, mengaut keuntungan daripada turun naik pasaran. High-Frequency Trading menggunakan algoritma canggih untuk melaksanakan beribu-ribu dagangan setiap hari, menangkap pergerakan harga kecil.'
)
WHERE id = 4;

-- 公告 5: Referral Program
UPDATE announcements SET
title_translations = JSON_OBJECT(
  'en', 'Referral Program - Earn While You Share',
  'zh-tw', '推薦計劃 - 分享即賺錢',
  'es', 'Programa de Referencias - Gana Mientras Compartes',
  'fr', 'Programme de Parrainage - Gagnez en Partageant',
  'de', 'Empfehlungsprogramm - Verdienen Sie beim Teilen',
  'ar', 'برنامج الإحالة - اكسب بينما تشارك',
  'pt', 'Programa de Indicação - Ganhe Enquanto Compartilha',
  'it', 'Programma di Referral - Guadagna Mentre Condividi',
  'tr', 'Yönlendirme Programı - Paylaşırken Kazanın',
  'vi', 'Chương trình Giới thiệu - Kiếm tiền khi Chia sẻ',
  'id', 'Program Referral - Dapatkan Sambil Berbagi',
  'ms', 'Program Rujukan - Perolehi Sambil Berkongsi'
),
content_translations = JSON_OBJECT(
  'en', 'Join our referral program and earn up to 10 levels of rewards! Share your unique referral code with friends and family. You will earn commissions on their trading activities. The more active referrals you have, the more you earn!',
  'zh-tw', '加入我們的推薦計劃，賺取高達 10 級獎勵！與朋友和家人分享您的獨特推薦代碼。您將從他們的交易活動中賺取佣金。您擁有的活躍推薦越多，您賺得越多！',
  'es', '¡Únete a nuestro programa de referencias y gana hasta 10 niveles de recompensas! Comparte tu código de referencia único con amigos y familiares. Ganarás comisiones por sus actividades de trading. ¡Cuantas más referencias activas tengas, más ganarás!',
  'fr', 'Rejoignez notre programme de parrainage et gagnez jusqu\'à 10 niveaux de récompenses ! Partagez votre code de parrainage unique avec vos amis et votre famille. Vous gagnerez des commissions sur leurs activités de trading. Plus vous avez de parrainages actifs, plus vous gagnez !',
  'de', 'Treten Sie unserem Empfehlungsprogramm bei und verdienen Sie bis zu 10 Ebenen an Belohnungen! Teilen Sie Ihren einzigartigen Empfehlungscode mit Freunden und Familie. Sie verdienen Provisionen auf deren Handelsaktivitäten. Je mehr aktive Empfehlungen Sie haben, desto mehr verdienen Sie!',
  'ar', 'انضم إلى برنامج الإحالة الخاص بنا واكسب ما يصل إلى 10 مستويات من المكافآت! شارك رمز الإحالة الفريد الخاص بك مع الأصدقاء والعائلة. ستكسب عمولات على أنشطتهم التجارية. كلما زادت الإحالات النشطة لديك، زادت أرباحك!',
  'pt', 'Participe do nosso programa de indicação e ganhe até 10 níveis de recompensas! Compartilhe seu código de indicação único com amigos e familiares. Você ganhará comissões sobre as atividades de trading deles. Quanto mais indicações ativas você tiver, mais ganhará!',
  'it', 'Unisciti al nostro programma di referral e guadagna fino a 10 livelli di ricompense! Condividi il tuo codice di referral unico con amici e familiari. Guadagnerai commissioni sulle loro attività di trading. Più referral attivi hai, più guadagni!',
  'tr', 'Yönlendirme programımıza katılın ve 10 seviyeye kadar ödül kazanın! Benzersiz yönlendirme kodunuzu arkadaşlarınız ve ailenizle paylaşın. Onların ticaret faaliyetlerinden komisyon kazanacaksınız. Ne kadar çok aktif yönlendirmeniz varsa, o kadar çok kazanırsınız!',
  'vi', 'Tham gia chương trình giới thiệu của chúng tôi và kiếm được tới 10 cấp độ phần thưởng! Chia sẻ mã giới thiệu độc đáo của bạn với bạn bè và gia đình. Bạn sẽ kiếm hoa hồng từ các hoạt động giao dịch của họ. Bạn có càng nhiều giới thiệu hoạt động, bạn kiếm được càng nhiều!',
  'id', 'Bergabunglah dengan program referral kami dan dapatkan hingga 10 level hadiah! Bagikan kode referral unik Anda dengan teman dan keluarga. Anda akan mendapatkan komisi dari aktivitas trading mereka. Semakin banyak referral aktif yang Anda miliki, semakin banyak yang Anda dapatkan!',
  'ms', 'Sertai program rujukan kami dan perolehi sehingga 10 tahap ganjaran! Kongsi kod rujukan unik anda dengan rakan dan keluarga. Anda akan mendapat komisen daripada aktiviti dagangan mereka. Semakin banyak rujukan aktif yang anda ada, semakin banyak yang anda perolehi!'
)
WHERE id = 5;

-- 公告 6: 多账号违规公告 (中文原文)
UPDATE announcements SET
title_translations = JSON_OBJECT(
  'en', 'Notice: Strict Action Against Multiple Account Violations',
  'zh-tw', '關於嚴厲打擊多賬號違規獲取推薦獎勵的公告',
  'es', 'Aviso: Acción Estricta Contra Violaciones de Múltiples Cuentas',
  'fr', 'Avis : Action Stricte Contre les Violations de Comptes Multiples',
  'de', 'Hinweis: Strenge Maßnahmen gegen Verstöße mit mehreren Konten',
  'ar', 'إشعار: إجراءات صارمة ضد انتهاكات الحسابات المتعددة',
  'pt', 'Aviso: Ação Rigorosa Contra Violações de Múltiplas Contas',
  'it', 'Avviso: Azione Rigorosa Contro le Violazioni di Account Multipli',
  'tr', 'Bildirim: Çoklu Hesap İhlallerine Karşı Sıkı Eylem',
  'vi', 'Thông báo: Hành động Nghiêm khắc Chống Vi phạm Đa Tài khoản',
  'id', 'Pemberitahuan: Tindakan Tegas Terhadap Pelanggaran Akun Ganda',
  'ms', 'Notis: Tindakan Tegas Terhadap Pelanggaran Akaun Berbilang'
),
content_translations = JSON_OBJECT(
  'en', 'Dear Users: Our system has recently detected some users engaging in fraudulent activities such as multiple account registrations to maliciously obtain referral rewards. Such behavior seriously disrupts the normal operation of our platform. Once discovered, we will take severe measures including but not limited to withdrawing illegal rewards and banning related accounts. Please help us maintain a fair and compliant community environment. Thank you for your support and cooperation.',
  'zh-tw', '尊敬的用戶：近期系統監測到部分用戶通過多賬號重複註冊等違規行為，惡意獲取推薦獎勵。此類行為嚴重干擾了平台的正常運營秩序。一經查獲，我司將採取收回違規獎勵、封禁相關賬號等嚴厲處罰措施。請大家共同維護公平合規的社區環境，感謝您的支持與配合。',
  'es', 'Estimados Usuarios: Nuestro sistema ha detectado recientemente que algunos usuarios participan en actividades fraudulentas, como el registro de múltiples cuentas para obtener maliciosamente recompensas por referencias. Tal comportamiento interrumpe seriamente la operación normal de nuestra plataforma. Una vez descubierto, tomaremos medidas severas que incluyen, entre otras, retirar recompensas ilegales y prohibir cuentas relacionadas. Por favor, ayúdenos a mantener un entorno comunitario justo y conforme. Gracias por su apoyo y cooperación.',
  'fr', 'Chers Utilisateurs : Notre système a récemment détecté des utilisateurs participant à des activités frauduleuses telles que l\'enregistrement de comptes multiples pour obtenir de manière malveillante des récompenses de parrainage. Un tel comportement perturbe gravement le fonctionnement normal de notre plateforme. Une fois découvert, nous prendrons des mesures sévères, notamment le retrait des récompenses illégales et l\'interdiction des comptes associés. Veuillez nous aider à maintenir un environnement communautaire équitable et conforme. Merci pour votre soutien et coopération.',
  'de', 'Sehr geehrte Benutzer: Unser System hat kürzlich einige Benutzer entdeckt, die betrügerische Aktivitäten wie mehrfache Kontoregistrierungen durchführen, um böswillig Empfehlungsbelohnungen zu erhalten. Solches Verhalten stört ernsthaft den normalen Betrieb unserer Plattform. Bei Entdeckung werden wir strenge Maßnahmen ergreifen, einschließlich, aber nicht beschränkt auf, die Rücknahme illegaler Belohnungen und die Sperrung zugehöriger Konten. Bitte helfen Sie uns, eine faire und konforme Community-Umgebung aufrechtzuerhalten. Vielen Dank für Ihre Unterstützung und Zusammenarbeit.',
  'ar', 'الأعزاء المستخدمين: اكتشف نظامنا مؤخراً بعض المستخدمين الذين يشاركون في أنشطة احتيالية مثل تسجيل حسابات متعددة للحصول بشكل ضار على مكافآت الإحالة. مثل هذا السلوك يعطل بشكل خطير التشغيل الطبيعي لمنصتنا. عند اكتشافه، سنتخذ إجراءات صارمة بما في ذلك على سبيل المثال لا الحصر سحب المكافآت غير القانونية وحظر الحسابات ذات الصلة. يرجى مساعدتنا في الحفاظ على بيئة مجتمعية عادلة ومتوافقة. شكراً لدعمكم وتعاونكم.',
  'pt', 'Prezados Usuários: Nosso sistema detectou recentemente alguns usuários envolvidos em atividades fraudulentas, como registros de múltiplas contas para obter maliciosamente recompensas de indicação. Tal comportamento perturba seriamente a operação normal de nossa plataforma. Uma vez descoberto, tomaremos medidas severas, incluindo, mas não se limitando a, retirar recompensas ilegais e banir contas relacionadas. Por favor, ajude-nos a manter um ambiente comunitário justo e conforme. Obrigado pelo seu apoio e cooperação.',
  'it', 'Cari Utenti: Il nostro sistema ha recentemente rilevato alcuni utenti che svolgono attività fraudolente come registrazioni di account multipli per ottenere malevolmente ricompense di referral. Tale comportamento disturba seriamente il normale funzionamento della nostra piattaforma. Una volta scoperto, prenderemo misure severe tra cui, ma non limitate a, il ritiro di ricompense illegali e il ban degli account correlati. Vi preghiamo di aiutarci a mantenere un ambiente comunitario equo e conforme. Grazie per il vostro supporto e cooperazione.',
  'tr', 'Sevgili Kullanıcılar: Sistemimiz yakın zamanda bazı kullanıcıların kötü niyetli olarak yönlendirme ödülleri elde etmek için çoklu hesap kayıtları gibi hileli faaliyetlerde bulunduğunu tespit etti. Bu tür davranışlar platformumuzun normal işleyişini ciddi şekilde bozar. Keşfedildiğinde, yasadışı ödüllerin geri alınması ve ilgili hesapların yasaklanması da dahil olmak üzere ciddi önlemler alacağız. Lütfen adil ve uyumlu bir topluluk ortamını korumamıza yardımcı olun. Desteğiniz ve işbirliğiniz için teşekkür ederiz.',
  'vi', 'Người dùng thân mến: Hệ thống của chúng tôi gần đây đã phát hiện một số người dùng tham gia các hoạt động gian lận như đăng ký nhiều tài khoản để có được phần thưởng giới thiệu một cách độc hại. Hành vi như vậy làm gián đoạn nghiêm trọng hoạt động bình thường của nền tảng chúng tôi. Khi phát hiện, chúng tôi sẽ thực hiện các biện pháp nghiêm khắc bao gồm nhưng không giới hạn việc thu hồi phần thưởng bất hợp pháp và cấm các tài khoản liên quan. Vui lòng giúp chúng tôi duy trì môi trường cộng đồng công bằng và tuân thủ. Cảm ơn sự hỗ trợ và hợp tác của bạn.',
  'id', 'Pengguna Terhormat: Sistem kami baru-baru ini mendeteksi beberapa pengguna yang terlibat dalam aktivitas penipuan seperti pendaftaran akun ganda untuk mendapatkan hadiah referral secara jahat. Perilaku seperti itu sangat mengganggu operasi normal platform kami. Setelah ditemukan, kami akan mengambil tindakan tegas termasuk namun tidak terbatas pada penarikan hadiah ilegal dan pelarangan akun terkait. Mohon bantu kami menjaga lingkungan komunitas yang adil dan sesuai. Terima kasih atas dukungan dan kerja sama Anda.',
  'ms', 'Pengguna Yang Dihormati: Sistem kami baru-baru ini mengesan beberapa pengguna terlibat dalam aktiviti penipuan seperti pendaftaran akaun berbilang untuk mendapatkan ganjaran rujukan secara jahat. Tingkah laku sedemikian mengganggu operasi normal platform kami secara serius. Setelah ditemui, kami akan mengambil langkah tegas termasuk tetapi tidak terhad kepada penarikan ganjaran haram dan larangan akaun berkaitan. Sila bantu kami mengekalkan persekitaran komuniti yang adil dan mematuhi peraturan. Terima kasih atas sokongan dan kerjasama anda.'
)
WHERE id = 6;
