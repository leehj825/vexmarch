// Vexmarch - the story: the common history, the six houses, the 30 places of the fixed map, the 24 officers and the ties between them.
// Plain data in English and Korean ({ en, ko }). The rules that use it are in js/sim/story.js. See docs/STORY.md for the bible this is taken from.
var VM = globalThis.VM = globalThis.VM || {};

(function () {
  const L = (en, ko) => ({ en, ko });

  // ---------------------------------------------------------------- the common history
  const HISTORY = {
    title: L('The Sundering', '분열의 시대'),
    // Shown before every campaign, whichever house you lead
    intro: [
      L('Four centuries ago a soldier named Aurel Vex bound six river-lands into one realm, the Dominion, and gave each march to one of his captains. Their houses ruled under a single throne at Vexholm for three hundred and eighty years. The throne kept the roads open, the grain moving and the passes quiet.',
        '사백 년 전 아우렐 벡스라는 군인이 여섯 강변의 땅을 하나로 묶어 도미니언을 세우고, 각 변경을 자신의 부장들에게 나누어 주었다. 그 가문들은 벡스홀름의 한 왕좌 아래 삼백팔십 년을 다스렸다. 왕좌는 길을 열어 두고, 곡식이 흐르게 하고, 고개를 조용히 지켜 주었다.'),
      L('Then Emperor Aldric IV, called the Gentle, died after a short illness. Some say it was not an illness. He left no grown heir; his grandson Edric, nine years old, sat in the keeping of his mother\'s house at Tessarune. The Emperor\'s last words were heard by three people, and they told three different stories.',
        '그러다 온화왕이라 불리던 황제 알드릭 4세가 짧은 병 끝에 세상을 떠났다. 병이 아니었다고 말하는 이들도 있다. 그에게는 장성한 후계자가 없었고, 아홉 살 된 손자 에드릭은 외가인 테사룬의 보호 아래 있었다. 황제의 마지막 말은 세 사람이 들었고, 세 사람은 서로 다른 이야기를 전했다.'),
      L('Within a season the Marshal-General demanded the regency, the trading cities stopped paying tribute, the Lantern Church declared that a throne must be chosen and not inherited, the mountain wardens closed the passes, and the riders of the steppe, whose grain had stopped, rode. Each had a claim. None had the whole truth.',
        '한 계절이 가기 전에, 총사령관은 섭정을 요구했고, 무역 도시들은 공물을 끊었고, 등불 교회는 왕좌란 물려받는 것이 아니라 선택하는 것이라 선언했고, 산악 수비대는 고개를 닫았고, 곡식이 끊긴 초원의 기수들은 말을 달렸다. 모두에게 명분이 있었고, 누구도 진실의 전부를 알지 못했다.'),
      L('In the middle of the realm, Vexholm stands with its walls, its archives and the crown. Whoever holds it can crown whom they like.',
        '나라의 한가운데에는 성벽과 문서고와 왕관을 품은 벡스홀름이 서 있다. 그곳을 차지한 자가 누구든 원하는 이에게 왕관을 씌울 수 있다.')
    ],
    timeline: [
      [-400, L('Marshal Aurel Vex unites six river-lands.', '아우렐 벡스 원수가 여섯 강변의 땅을 통일한다.')],
      [-210, L('The Salt Famine: the coast cities buy their charters with grain loans.', '소금 기근: 해안 도시들이 곡식을 빌려 주고 자치 특허를 사들인다.')],
      [-120, L('The Lantern Church is founded in the eastern hills.', '동쪽 구릉에서 등불 교회가 세워진다.')],
      [-60, L('The Pass War: the mountain wardens are paid to hold the north gates.', '고개 전쟁: 산악 수비대가 북쪽 관문을 지키는 대가를 받기로 한다.')],
      [-31, L('The Steppe Accord: Thornreach is given grain, not land.', '초원 협약: 쏜리치에는 땅이 아닌 곡식이 주어진다.')],
      [0, L('Emperor Aldric IV dies. The Council of Candles ends in shouting.', '황제 알드릭 4세가 죽는다. 촛불 회의는 고함 속에 끝난다.')],
      [1, L('The Sundering begins.', '분열이 시작된다.')]
    ]
  };

  // ---------------------------------------------------------------- the six houses (index = faction id - 1: the order of VM.CFG.FACTIONS)
  const FACTIONS = [
    { id: 1, key: 'kaldrath', ruler: L('Margrave Ordan Kaldrath', '변경백 오르단 칼드라스'), title: L('The Iron Regency', '강철의 섭정'),
      creed: L('The realm must not be torn apart. Someone must hold it together, and the army is the only part still working.', '나라가 찢어져서는 안 된다. 누군가는 붙들어야 하고, 아직 움직이는 것은 군대뿐이다.'),
      wound: L('Forty years of loyalty, and now accused of poisoning the Emperor.', '사십 년을 충성했건만, 이제는 황제를 독살했다는 의심을 받는다.'),
      danger: L('To hold the realm together he must become the thing he fears: a king.', '나라를 붙들려면 그가 가장 두려워하는 존재, 곧 왕이 되어야 한다.') },
    { id: 2, key: 'orsolyn', ruler: L('First Syndic Maren Voss', '제1 집정관 마렌 보스'), title: L('The Free Charter', '자유 헌장'),
      creed: L('Nobody, noble or priest, should own another person\'s road, and no war is so cheap as the one you pay someone else to avoid.', '귀족이든 사제든 남의 길을 소유해서는 안 되며, 전쟁을 돈으로 피하는 것만큼 싼 전쟁은 없다.'),
      wound: L('For two centuries the throne taxed their ships and never gave them a vote.', '이백 년 동안 왕좌는 그들의 배에 세금을 매기면서도 투표권은 주지 않았다.'),
      danger: L('A republic of merchants cannot ask its people to die for it for long.', '상인의 공화국은 오래도록 백성에게 목숨을 요구할 수 없다.') },
    { id: 3, key: 'tessarune', ruler: L('Margravine Ilsa Tessar', '변경백비 일사 테사르'), title: L('The Gentle Regency', '온화한 섭정'),
      creed: L('The child must live and be crowned. A realm that is fed forgives a great deal.', '아이는 살아서 즉위해야 한다. 배부른 나라는 많은 것을 용서한다.'),
      wound: L('They hold the heir, and every other house wants to rescue him or remove him.', '그들이 후계자를 지키고 있고, 다른 모든 가문은 그를 구해내거나 없애려 한다.'),
      danger: L('The child is both their shield and their chain.', '아이는 그들의 방패이자 족쇄다.') },
    { id: 4, key: 'marrowgate', ruler: L('Warden Brannoch Marrow', '수비대장 브라노크 마로'), title: L('The Gate Compact', '관문 맹약'),
      creed: L('The mountains were never conquered, only paid. The toll is a debt, not an insult.', '산은 정복된 적이 없고 값을 치렀을 뿐이다. 통행료는 모욕이 아니라 빚이다.'),
      wound: L('The throne forgot to pay them last winter, and two border posts starved.', '지난겨울 왕좌가 대가를 잊었고, 국경 초소 두 곳이 굶어 죽었다.'),
      danger: L('A people of fortresses wins by making war too costly, and loses by never ending it.', '요새의 백성은 전쟁을 너무 비싸게 만들어 이기고, 끝내지 못해서 진다.') },
    { id: 5, key: 'wickfront', ruler: L('High Lector Sevrin Ash', '대성직자 세브린 애시'), title: L('The Conclave of Light', '빛의 선택회'),
      creed: L('A crown that is only inherited cannot be taken back. A throne must be chosen, in the light, by the faithful.', '그저 물려받은 왕관은 거둘 수 없다. 왕좌는 빛 아래에서 신도들이 선택해야 한다.'),
      wound: L('For a century the church was tolerated and never trusted.', '한 세기 동안 교회는 용인되었을 뿐 신뢰받은 적이 없다.'),
      danger: L('He knows what the Emperor said, and cannot tell it without ending the church\'s claim.', '그는 황제가 한 말을 알지만, 말하면 교회의 명분이 끝난다.') },
    { id: 6, key: 'thornreach', ruler: L('Chieftain Dagna Thorn', '족장 다그나 쏜'), title: L('The Rider\'s Right', '기수의 권리'),
      creed: L('The empire paid for peace with grain. When the grain stopped, so did the peace. What the plains need, the plains take.', '제국은 곡식으로 평화를 샀다. 곡식이 끊기자 평화도 끝났다. 초원에 필요한 것은 초원이 가져간다.'),
      wound: L('For thirty years her people were called allies and counted as beggars.', '삼십 년 동안 그녀의 백성은 동맹이라 불리면서 거지로 취급받았다.'),
      danger: L('A people that wins by speed cannot hold what it takes.', '속도로 이기는 백성은 빼앗은 것을 지키지 못한다.') }
  ];

  // ---------------------------------------------------------------- the 30 places, on the 6 x 5 grid (col, row). owner 0 = neutral at the start.
  // spec: capital, farmland, market, pass, port, iron, horse, holy, town
  const P = (col, row, name, ko, spec, owner, en, kr) => ({ col, row, name, ko, spec, owner, history: en ? L(en, kr) : null });
  const PLACES = [
    P(0, 0, 'Oakmere', '오크미어', 'farmland', 3), P(1, 0, 'Goldfield', '골드필드', 'farmland', 3), P(2, 0, 'Coldravel', '콜드라벨', 'town', 4), P(3, 0, 'Irondeep', '아이언딥', 'iron', 4),
    P(4, 0, 'Highgate', '하이게이트', 'pass', 4, 'The northern gate the wardens were paid to hold, forever.', '수비대가 영원히 지키기로 하고 삯을 받은 북쪽 관문.'), P(5, 0, 'Skald\'s Rest', '스칼드의 쉼터', 'horse', 6),
    P(0, 1, 'Millbrook', '밀브룩', 'market', 3), P(1, 1, 'Tessar Keep', '테사르 성채', 'capital', 3, 'The keep where the Empress was born and where her son now learns his letters.', '황후가 태어난 성채. 이제 그녀의 아들이 글을 배우는 곳.'),
    P(2, 1, 'Windgap', '윈드갭', 'pass', 0, 'A low saddle in the mountains, the only easy road between the grain basin and the capital.', '곡창 분지와 수도 사이의 유일한 쉬운 길, 산맥의 낮은 안부.'),
    P(3, 1, 'Marrow Hold', '마로 요새', 'capital', 4, 'Carved into the mountain itself; no army has ever taken it.', '산을 파서 만든 요새. 어떤 군대도 함락한 적이 없다.'),
    P(4, 1, 'Eastgap', '이스트갭', 'pass', 0, 'The pass the riders use when the wardens are not looking.', '수비대가 한눈파는 사이 기수들이 지나다니는 고개.'), P(5, 1, 'The Great Camp', '대천막', 'capital', 6, 'Four thousand tents in summer; not one wall.', '여름이면 천막 사천 개, 성벽은 하나도 없다.'),
    P(0, 2, 'Saltmarsh', '솔트마시', 'port', 2), P(1, 2, 'Brackwater', '브랙워터', 'town', 0, 'A river town that has changed hands six times and been paid for each one.', '여섯 번 주인이 바뀌었고, 그때마다 값을 치른 강변 마을.'),
    P(2, 2, 'Vexholm', '벡스홀름', 'capital', 0, 'The old capital. The crown, the archives, and walls that no one has ever breached.', '옛 수도. 왕관과 문서고, 누구도 뚫은 적 없는 성벽이 있다.'),
    P(3, 2, 'Hallowford', '할로포드', 'holy', 5, 'Where the Lantern Church lit its first candle, at a ford.', '등불 교회가 여울목에서 첫 촛불을 밝힌 곳.'), P(4, 2, 'Lanternhold', '랜턴홀드', 'capital', 5, 'The church\'s seat, and its archive of three hundred years of confessions.', '교회의 본거지이자 삼백 년의 고해를 보관한 문서고.'),
    P(5, 2, 'Redgrass', '레드그래스', 'horse', 6),
    P(0, 3, 'Silvermouth', '실버마우스', 'capital', 2, 'The richest harbor on the coast; every canal in the south ends here.', '해안에서 가장 부유한 항구. 남쪽의 모든 운하가 이곳에서 끝난다.'), P(1, 3, 'Ashford', '애시포드', 'market', 1),
    P(2, 3, 'Redhold', '레드홀드', 'capital', 1, 'The Marshal\'s seat, south of the capital, with the army\'s oldest barracks.', '수도 남쪽의 원수의 거처. 군대에서 가장 오래된 병영이 있다.'),
    P(3, 3, 'Stonebridge', '스톤브리지', 'town', 1), P(4, 3, 'Pilgrim\'s Rest', '순례자의 쉼터', 'holy', 5), P(5, 3, 'Tallsedge', '톨세지', 'horse', 6),
    P(0, 4, 'Greywater', '그레이워터', 'port', 2), P(1, 4, 'Canalside', '캐널사이드', 'market', 2), P(2, 4, 'Vexford', '벡스포드', 'farmland', 1, 'The ford where Marshal Vex made his stand, four hundred years ago.', '사백 년 전 벡스 원수가 맞서 싸운 여울목.'),
    P(3, 4, 'Free Harbor', '자유항', 'port', 0), P(4, 4, 'Ashmoor', '애시무어', 'town', 5), P(5, 4, 'Dry Wells', '드라이웰스', 'town', 0, 'A trading post on the steppe edge, where the Accord grain was handed over.', '협약의 곡식을 건네주던 초원 가장자리의 교역소.')
  ];
  // roads: every orthogonal link of the grid except the ones removed, plus a few diagonals (at most one per cell, so roads never cross)
  const CUT = ['1,0-2,0', '3,1-3,2', '2,1-3,1', '0,1-0,2', '4,1-5,1', '3,3-3,4', '2,2-2,3'];
  const DIAG = ['1,1-2,2', '3,2-2,3', '4,2-5,3', '1,2-0,3', '1,3-2,4', '3,0-4,1', '3,3-4,4'];

  // ---------------------------------------------------------------- the 24 officers: four to a house. s = [command, might, politics, intellect]
  const O = (key, name, ko, house, role, trait, s, en, kr) => ({ key, name, ko, house, role, trait, stats: s, bio: L(en, kr) });
  const OFFICERS = [
    O('halric', 'Halric Vane', '할릭 베인', 1, L('veteran general', '노장군'), 'Loyal', [86, 70, 42, 62], 'Forty years at Ordan\'s side; wears the same grey cloak in every winter.', '오르단의 곁에서 사십 년. 어느 겨울에나 같은 회색 외투를 입는다.'),
    O('cael', 'Cael Dunmere', '카엘 던미어', 1, L('young captain', '젊은 대위'), 'Brave', [66, 78, 40, 52], 'A farmer\'s son raised in Halric\'s tent. He believes in the realm because he has never seen it fail.', '할릭의 막사에서 자란 농부의 아들. 나라가 무너지는 것을 본 적이 없어 나라를 믿는다.'),
    O('sera', 'Sera Halde', '세라 할데', 1, L('cavalry scout', '기병 정찰대장'), 'Rash', [64, 72, 36, 58], 'The border riders\' best tracker, who joined the empire\'s service after her mother died.', '국경 기수들 가운데 가장 뛰어난 추적자. 어머니가 죽은 뒤 제국의 군에 들어왔다.'),
    O('varek', 'Varek Sorn', '바렉 손', 1, L('quartermaster and spymaster', '병참장교 겸 첩보대장'), 'Schemer', [48, 40, 82, 80], 'He keeps the books and the secrets. He owes a great deal of money.', '장부와 비밀을 관리한다. 갚아야 할 빚이 아주 많다.'),
    O('alis', 'Alis Quaille', '알리스 퀘일', 2, L('captain of the guard', '근위대장'), 'Cautious', [78, 52, 66, 74], 'She has never lost a ship and never started a fight. She knows what the League can afford.', '배를 잃은 적도, 싸움을 건 적도 없다. 연맹이 감당할 수 있는 것이 무엇인지 안다.'),
    O('teodor', 'Teodor Bask', '테오도르 바스크', 2, L('mercenary captain', '용병대장'), 'Greedy', [74, 76, 38, 50], 'He left Kaldrath\'s army after a quarrel over pay and a battle he blames on Halric.', '급료 문제와 패전의 책임을 할릭에게 돌리며 칼드라스 군을 떠났다.'),
    O('isaure', 'Isaure Fenn', '이소르 펜', 2, L('banker and informant', '은행가 겸 정보원'), 'Schemer', [40, 30, 88, 84], 'She holds half the realm\'s debts, Varek Sorn\'s among them.', '나라 빚의 절반을 쥐고 있다. 바렉 손의 빚도 그중 하나다.'),
    O('joren', 'Joren Pike', '요렌 파이크', 2, L('harbor engineer', '항만 기술자'), 'Loyal', [58, 54, 60, 76], 'He builds what the League needs: chains, canals, siege towers.', '연맹에 필요한 것을 만든다. 쇠사슬, 운하, 공성탑.'),
    O('ysolde', 'Ysolde Tessar', '이졸데 테사르', 3, L('the prince\'s cousin and guardian', '왕자의 사촌이자 수호자'), 'Brave', [70, 80, 52, 56], 'Twenty-four, trained with a sword against her family\'s wishes. She swore never to let the boy be taken.', '스물넷. 가문의 뜻을 거스르고 검을 익혔다. 아이를 결코 빼앗기지 않겠다고 맹세했다.'),
    O('gerrick', 'Gerrick Oats', '게릭 오츠', 3, L('steward-general', '총집사 장군'), 'Loyal', [72, 48, 80, 66], 'Fifty years in the family\'s service; he keeps the granaries and the army fed.', '가문을 위해 오십 년. 곡창과 군대를 먹여 살린다.'),
    O('anselm', 'Anselm Rook', '안셀름 룩', 3, L('the prince\'s tutor', '왕자의 가정교사'), 'Cautious', [44, 30, 78, 90], 'A scholar who left the Lantern Church to teach a child.', '아이를 가르치려고 등불 교회를 떠난 학자.'),
    O('dorran', 'Dorran Pell', '도란 펠', 3, L('herald and captain', '전령 겸 대위'), 'Rash', [62, 66, 58, 44], 'He makes a speech before every battle. Some of them have won it.', '전투 전마다 연설을 한다. 그중 몇 번은 연설이 전투를 이겼다.'),
    O('kestrel', 'Kestrel Marrow', '케스트럴 마로', 4, L('wall-captain', '성벽 대장'), 'Rash', [70, 74, 40, 52], 'The Warden\'s daughter, twenty-two. She wants a war and thinks her father is too patient.', '수비대장의 딸, 스물두 살. 전쟁을 원하며 아버지가 너무 참을성이 많다고 생각한다.'),
    O('ulf', 'Ulf Dray', '울프 드레이', 4, L('master of mines and siege', '광산 및 공성 책임자'), 'Greedy', [64, 60, 50, 76], 'He knows where every ore seam and every weakness in a wall lies.', '광맥과 성벽의 약점을 모두 꿰고 있다.'),
    O('hilde', 'Hilde Ironvein', '힐데 아이언베인', 4, L('pass commander', '고개 지휘관'), 'Loyal', [76, 68, 44, 54], 'She held the north gate through two winters on short rations.', '두 겨울 동안 부족한 식량으로 북쪽 관문을 지켰다.'),
    O('osric', 'Osric Thane', '오스릭 세인', 4, L('exiled engineer', '망명 기술자'), 'Schemer', [52, 40, 70, 88], 'He built the Dominion\'s greatest walls and then fell out with the court.', '도미니언의 가장 큰 성벽들을 쌓고, 궁정과 갈라섰다.'),
    O('mirabel', 'Sister Mirabel Cole', '미라벨 콜 수녀', 5, L('war-nun', '전투 수녀'), 'Brave', [74, 70, 46, 60], 'She leads the Lantern\'s guard and has never lost a man she could carry out.', '등불 근위대를 이끌며, 업고 나올 수 있었던 병사를 잃은 적이 없다.'),
    O('vorn', 'Vorn Calder', '보른 칼더', 5, L('the Lector\'s inquisitor', '대성직자의 심문관'), 'Schemer', [46, 44, 76, 82], 'He hears confessions, and files them.', '고해를 듣고, 기록해 둔다.'),
    O('oswin', 'Oswin Oats', '오스윈 오츠', 5, L('lantern-knight', '등불 기사'), 'Loyal', [68, 72, 48, 56], 'A Tessarune knight who took the Lantern\'s vow. His father does not speak of it.', '등불의 서약을 한 테사룬 출신 기사. 아버지는 그 이야기를 입에 올리지 않는다.'),
    O('lysa', 'Lysa Grane', '리사 그레인', 5, L('field healer and captain', '야전 치유사 겸 대위'), 'Cautious', [60, 40, 68, 78], 'The only officer both sides call by her first name.', '양쪽 모두가 이름으로 부르는 유일한 장교.'),
    O('rurik', 'Rurik Skald', '루릭 스칼드', 6, L('horse-lord general', '기마 대장군'), 'Rash', [84, 78, 34, 48], 'The finest rider on the plains. He thinks a battle is something you finish before noon.', '초원에서 가장 뛰어난 기수. 전투는 정오 전에 끝내는 것이라 생각한다.'),
    O('tomas', 'Tomas Halde', '토마스 할데', 6, L('scout-chief', '정찰 대장'), 'Brave', [66, 74, 44, 60], 'He rode for the empire until it forgot to feed his people. He never stopped writing to his sister.', '제국이 그의 백성을 먹이는 것을 잊을 때까지 제국을 위해 말을 달렸다. 누이에게 쓰는 편지는 멈추지 않았다.'),
    O('yara', 'Yara Wen', '야라 웬', 6, L('outrider and envoy', '척후병 겸 사절'), 'Cautious', [56, 48, 80, 82], 'She reads three languages and the weather. Dagna\'s voice in other camps.', '세 언어와 날씨를 읽는다. 다른 진영에서 다그나의 목소리가 되어 준다.'),
    O('brask', 'Brask Odd', '브라스크 오드', 6, L('raid-master', '약탈 대장'), 'Greedy', [68, 80, 30, 40], 'He takes what he can carry, and usually a little more.', '들고 갈 수 있는 것을 가져가고, 대개는 조금 더 가져간다.')
  ];

  // ---------------------------------------------------------------- ties: [type, a, b, note]. kin, oath, mentor (a teaches b), friend, rival, love, debt (a owes b)
  const TIES = [
    ['oath', 'halric', 'ordan'], ['mentor', 'halric', 'cael'], ['rival', 'halric', 'teodor'], ['friend', 'halric', 'osric'], ['love', 'cael', 'ysolde'],
    ['kin', 'sera', 'tomas'], ['debt', 'varek', 'isaure'], ['friend', 'alis', 'joren'], ['kin', 'gerrick', 'oswin'], ['mentor', 'sevrin', 'anselm'],
    ['kin', 'kestrel', 'brannoch'], ['oath', 'hilde', 'brannoch'], ['friend', 'yara', 'dagna'], ['kin', 'ysolde', 'edric']
  ];

  // ---------------------------------------------------------------- the ends: shown when you hold every place, one for each house
  const ENDINGS = {
    1: L('The Marshal\'s Burden. The last gate of the last holdout opens, and Ordan Kaldrath rides into Vexholm at the head of the army that never stopped serving. The boy-emperor is brought out and the crowd goes quiet. Ordan kneels, and the realm sees that the one man who could have taken the crown has given it back. It will cost him the rest of his life to make it mean something.',
          '원수의 짐. 마지막 거점의 마지막 성문이 열리고, 오르단 칼드라스는 한 번도 복무를 멈추지 않은 군대의 선두에서 벡스홀름으로 들어선다. 어린 황제가 모습을 드러내자 군중이 조용해진다. 오르단이 무릎을 꿇는다. 왕관을 가질 수 있었던 단 한 사람이 그것을 돌려준 것이다. 그 뜻을 지키는 데 남은 평생이 들 것이다.'),
    2: L('The Charter. There is no emperor. In the great hall at Vexholm the cities sign a charter that no one house can break, and the first vote is taken by raised hands, a hundred and twelve to nine. Maren Voss does not smile. She counts the cost again, and finds, for the first time, that it comes out even.',
          '헌장. 황제는 없다. 벡스홀름의 대회당에서 도시들은 어느 한 가문도 깨뜨릴 수 없는 헌장에 서명하고, 첫 투표는 손을 들어 백열두 대 아홉으로 끝난다. 마렌 보스는 웃지 않는다. 그녀는 비용을 다시 헤아려 보고, 처음으로 수지가 맞는다는 것을 알게 된다.'),
    3: L('The Gentle Reign. Prince Edric is crowned at twelve, in a coat that is too large, with his grandmother\'s hand on his shoulder. The granaries are full. In a hall of men who each wanted the throne, the child asks a question no one expected: "What do you need?" Ilsa Tessar writes the answers down, and begins.',
          '온화한 치세. 에드릭 왕자는 열두 살에 너무 큰 외투를 입고 할머니의 손이 어깨에 놓인 채 즉위한다. 곡창은 가득 차 있다. 저마다 왕좌를 원했던 사내들의 홀에서 아이가 아무도 예상하지 못한 질문을 한다. "무엇이 필요합니까?" 일사 테사르는 그 대답을 받아 적으며 시작한다.'),
    4: L('The Gate Compact. For the first time in four hundred years the mountains are paid in full, and in front of everyone. Brannoch Marrow signs, and the passes open on terms that the wardens themselves wrote. Kestrel stands behind her father. She has the war she wanted. She finds she does not want it again.',
          '관문 맹약. 사백 년 만에 처음으로 산은 모두가 보는 앞에서 값을 전부 받는다. 브라노크 마로가 서명하고, 고개는 수비대가 직접 쓴 조건으로 열린다. 케스트럴은 아버지 뒤에 서 있다. 원하던 전쟁을 치렀고, 다시는 원하지 않는다는 것을 알게 된다.'),
    5: L('The Light Chosen. The conclave meets in the great hall with every candle lit. Sevrin Ash rises and, at last, tells the assembly what the Emperor said, and what he did not. The silence is long. Then someone begins, very quietly, to sing the old Lantern hymn, and the choice is made by all of them.',
          '선택된 빛. 모든 촛불이 켜진 대회당에서 선택회가 열린다. 세브린 애시가 일어나 마침내 황제가 한 말과 하지 않은 말을 회중에게 알린다. 침묵이 길게 이어진다. 그러다 누군가 아주 조용히 오래된 등불의 찬가를 부르기 시작하고, 선택은 모두의 손으로 이루어진다.'),
    6: L('The Rider King. Dagna Thorn rides through the gates of Vexholm on a grey horse, alone, and no one dares to stop her. She sits in the throne for the length of one breath, laughs, and stands up again. A rider-queen cannot rule from a chair. Her first order is to open the granaries, and her second is to find someone who knows how to run them.',
          '기수의 왕. 다그나 쏜은 회색 말을 타고 홀로 벡스홀름의 성문을 지나고, 누구도 감히 막지 못한다. 그녀는 숨 한 번 쉴 동안 왕좌에 앉았다가 웃으며 일어선다. 기수의 여왕은 의자에서 다스릴 수 없다. 그녀의 첫 명령은 곡창을 여는 것이고, 두 번째는 그것을 운영할 줄 아는 사람을 찾는 것이다.')
  };
  const DEFEAT = L('The Sundering takes your house. The banners come down, the officers scatter, and the realm goes on without you. History will remember what you fought for, and who finally won.',
                   '분열은 당신의 가문마저 삼켜 버렸다. 깃발은 내려지고 장교들은 흩어지고, 나라는 당신 없이 계속된다. 역사는 당신이 무엇을 위해 싸웠는지, 마침내 누가 이겼는지를 기억할 것이다.');

  // ---------------------------------------------------------------- how each house opens its campaign (shown after the common history)
  const OPENINGS = {
    1: L('You are Ordan Kaldrath, Marshal-General, and every messenger who reaches Redhold brings you a different rumour about how the Emperor died. You did not do it. You cannot prove that. Halric Vane stands at your shoulder, as he has for forty years. "The army is still ours," he says. "Tell us where to march."',
         '당신은 총사령관 오르단 칼드라스다. 레드홀드에 닿는 전령마다 황제가 어떻게 죽었는지 다른 소문을 들고 온다. 당신이 한 일이 아니다. 그러나 증명할 수는 없다. 할릭 베인이 사십 년 그랬듯 당신의 어깨 곁에 서 있다. "군대는 아직 우리 것입니다. 어디로 진군할지 말씀하십시오."'),
    2: L('You are Maren Voss, First Syndic, and the ledgers on your table say that the Dominion owes the coast cities more than the coast cities owe the Dominion. The last tribute ship has been turned around. Isaure Fenn sets down a new page without a word: the price of every sword for hire in the south.',
         '당신은 제1 집정관 마렌 보스다. 탁자 위의 장부에는 도미니언이 해안 도시들에 진 빚이 해안 도시들이 도미니언에 진 빚보다 크다고 적혀 있다. 마지막 공물선은 돌려보냈다. 이소르 펜이 말없이 새 장을 올려놓는다. 남쪽에서 고용할 수 있는 모든 검의 값이다.'),
    3: L('You are Ilsa Tessar, and the child asleep in the next room is the Emperor\'s grandson and your own. Every house wants him, to crown or to remove. Ysolde stands at the door with her hand on her sword. Anselm has already packed the boy\'s books. "We can feed an army," says Gerrick Oats. "We cannot yet lead one."',
         '당신은 일사 테사르다. 옆방에서 자고 있는 아이는 황제의 손자이자 당신의 손자다. 모든 가문이 그를 원한다, 왕관을 씌우거나 없애기 위해. 이졸데가 검에 손을 얹고 문가에 서 있다. 안셀름은 이미 아이의 책을 싸 두었다. "군대를 먹일 수는 있습니다." 게릭 오츠가 말한다. "아직 이끌 수는 없습니다."'),
    4: L('You are Brannoch Marrow, Warden of the Gates, and for the second winter in a row the throne\'s payment has not come. Two border posts are dead. Kestrel wants to march south; Hilde Ironvein wants to hold; you want to be paid. You close the passes, and the mountains go quiet, which is how they speak.',
         '당신은 관문의 수비대장 브라노크 마로다. 두 번째 겨울에도 왕좌의 지불은 오지 않았다. 국경 초소 두 곳이 죽었다. 케스트럴은 남쪽으로 진군하길 원하고, 힐데 아이언베인은 지키길 원하고, 당신은 값을 받길 원한다. 고개를 닫자 산이 조용해진다. 산이 말하는 방식이다.'),
    5: L('You are Sevrin Ash, High Lector, and you are the only living person who knows exactly what the Emperor said. You have not told even Vorn Calder, who files everything. You have told yourself that a choice made in the light must be made by the many, and that this is why you are silent.',
         '당신은 대성직자 세브린 애시이며, 황제가 정확히 무슨 말을 했는지 아는 유일한 생존자다. 모든 것을 기록하는 보른 칼더에게도 말하지 않았다. 빛 아래의 선택은 다수가 해야 하며, 그래서 침묵한다고 스스로에게 말해 왔다.'),
    6: L('You are Dagna Thorn, and the storehouses at Dry Wells are empty. Thirty years of "allies" and the first winter without grain was the last. Rurik wants to ride before the snow; Yara wants to talk; Brask is already counting what the south has that you do not. You take the horse-tail banner down from the pole.',
         '당신은 다그나 쏜이고, 드라이웰스의 창고는 비어 있다. 삼십 년의 "동맹" 끝에 곡식 없는 첫 겨울이 마지막이었다. 루릭은 눈이 오기 전에 달리자 하고, 야라는 대화를 원하고, 브라스크는 이미 남쪽에 있고 당신에게 없는 것을 세고 있다. 당신은 장대에서 말총 깃발을 내린다.')
  };

  // ---------------------------------------------------------------- the story beats (the conditions are in js/sim/story.js). Texts with {…} are filled in from the game.
  const BEATS = {
    first_blood: { title: L('First Blood', '첫 피'), text: L('The first real fight of the Sundering is over, and it is smaller and uglier than anyone had pictured. Men who shared a barracks a year ago now count each other\'s dead. From here on, the marching banners mean something.', '분열의 첫 실제 전투가 끝났다. 누구의 상상보다 작고 추했다. 일 년 전 같은 막사를 쓰던 사내들이 서로의 죽은 자를 센다. 이제부터 진군하는 깃발에는 뜻이 생긴다.') },
    first_fall: { title: L('A City Falls', '도시가 함락되다'), text: L('A city has changed hands for the first time. The gates are the same, the market is the same, only the banner on the keep is different. People bargain with whoever is in the square.', '처음으로 도시의 주인이 바뀌었다. 성문도 시장도 그대로이고, 성채 위의 깃발만 다르다. 사람들은 광장에 서 있는 자와 흥정한다.') },
    siblings: { title: L('Letters Across the Border', '국경 너머의 편지'), text: L('Sera Halde of Kaldrath has not spoken to her brother Tomas of Thornreach since the Sundering. Both hear the other\'s name in every report from the border. Neither sends a letter. Both write one, and keep it.', '칼드라스의 세라 할데는 분열 이후 쏜리치의 오빠 토마스와 말을 나누지 않았다. 국경에서 올라오는 보고마다 서로의 이름이 들린다. 아무도 편지를 보내지 않는다. 둘 다 쓰고, 간직한다.') },
    siblings_clash: { title: L('Brother Against Sister', '오빠와 누이'), text: L('Sera Halde and Tomas Halde have met across a field. Neither gives the order to attack. Neither, in the end, needs to: their captains do it for them. What they say to each other afterwards, no one hears.', '세라 할데와 토마스 할데가 들판을 사이에 두고 마주 섰다. 누구도 공격을 명하지 않는다. 결국 그럴 필요도 없었다. 부하 대장들이 대신 했다. 나중에 둘이 나눈 말은 아무도 듣지 못한다.') },
    ledger: { title: L('The Ledger', '장부'), text: L('Isaure Fenn sends a courteous reminder that a certain sum is overdue. Varek Sorn reads it twice and puts it in the fire, which does not make the debt smaller. The quartermaster begins to look at his own supply lists as if they were someone else\'s.', '이소르 펜이 어떤 금액의 기한이 지났다는 정중한 독촉장을 보낸다. 바렉 손은 두 번 읽고 불 속에 던지지만 빚은 줄지 않는다. 병참장교는 자신의 보급 목록을 남의 것처럼 바라보기 시작한다.') },
    old_comrades: { title: L('Old Comrades', '옛 전우들'), text: L('On one side of the wall stands Halric Vane, grey-cloaked and tired. On the other, Osric Thane, who built it. They shared a tent in the old imperial campaigns, and each knows exactly where the other would put the weak point. Neither says it aloud.', '성벽 한쪽에는 회색 외투를 입은 지친 할릭 베인이 서 있다. 반대편에는 그것을 쌓은 오스릭 세인이 있다. 둘은 옛 제국 원정에서 한 막사를 썼고, 상대가 약점을 어디에 두었을지 정확히 안다. 누구도 입 밖에 내지 않는다.') },
    lantern_vow: { title: L('The Lantern Vow', '등불의 서약'), text: L('Gerrick Oats has served one house all his life. His son Oswin took the Lantern\'s vow, and now the two banners face each other at a gate. The old steward does not speak of it. He only asks, once, whether the boy has eaten.', '게릭 오츠는 평생 한 가문을 섬겼다. 아들 오스윈은 등불의 서약을 했고, 이제 두 깃발이 한 성문을 사이에 두고 마주 섰다. 늙은 집사는 말하지 않는다. 다만 한 번, 아이가 밥은 먹었느냐고 묻는다.') },
    letter: { title: L('A Letter Across the Lines', '전선 너머의 편지'), text: L('A letter reaches Ysolde Tessar by an honest courier: three lines in a soldier\'s hand, from Cael Dunmere. It says nothing about the war. It says he saw a field of her family\'s wheat, and thought of her. She does not answer. She keeps it in her sleeve.', '정직한 전령이 이졸데 테사르에게 편지를 전한다. 카엘 던미어가 군인의 필체로 쓴 세 줄이다. 전쟁 이야기는 한 마디도 없다. 그녀 가문의 밀밭을 보고 그녀를 생각했다는 내용이다. 그녀는 답하지 않는다. 소매 속에 간직한다.') },
    capital_falls: { title: L('A Capital Falls', '수도가 함락되다'), text: L('{city}, the seat of {house}, has fallen. The banner comes down from the keep, and the rest of the house\'s towns begin, one by one, to look for a new master.', '{house}의 본거지 {city}이(가) 함락되었다. 성채에서 깃발이 내려지고, 가문의 나머지 도시들은 하나씩 새 주인을 찾기 시작한다.') },
    vexholm: { title: L('Vexholm', '벡스홀름'), text: L('Vexholm has opened its gates to {house}. Nobody breached the walls; somebody simply decided that the archives and the crown mattered more than the siege. Whoever sits here can crown whom they like, and every house knows it.', '벡스홀름이 {house}에게 성문을 열었다. 성벽을 뚫은 자는 없다. 누군가 문서고와 왕관이 포위전보다 중요하다고 판단했을 뿐이다. 이곳에 앉은 자는 원하는 이에게 왕관을 씌울 수 있고, 모든 가문이 그것을 안다.') },
    first_death: { title: L('{name} Is Dead', '{name}의 죽음'), text: L('{name}, {role}, is dead. {bio} Whatever the war becomes, it has now taken someone who could not be replaced.', '{role} {name}이(가) 죽었다. {bio} 이 전쟁이 무엇이 되든, 대체할 수 없는 사람을 이미 앗아 갔다.') },
    eliminated: { title: L('A House Falls', '가문이 무너지다'), text: L('{house} has no more cities. Its banners are folded, its officers scattered, and its story, whatever it was, is now a thing that others will tell.', '{house}에게 더 이상 도시가 없다. 깃발은 접히고 장교들은 흩어졌으며, 그 가문의 이야기는 이제 다른 이들이 전할 것이다.') }
  };

  // names in Korean, for the translation table (js/lang_ko.js) and the chronicle
  const NAMES_KO = { Kaldrath: '칼드라스', Orsolyn: '오르솔린', Tessarune: '테사룬', Marrowgate: '마로게이트', Wickfront: '윅프런트', Thornreach: '쏜리치' };
  PLACES.forEach(p => { NAMES_KO[p.name] = p.ko; });
  OFFICERS.forEach(o => { NAMES_KO[o.name] = o.ko; });

  VM.StoryData = { OPENINGS, BEATS, NAMES_KO, HISTORY, FACTIONS, PLACES, CUT, DIAG, OFFICERS, TIES, ENDINGS, DEFEAT, L };
})();
