// The guide to the newer systems: short pages, read at your own pace from the title screen (Guide) or the pause menu. It uses the story box. Each page is
// plain text in English and Korean; a page is one system, so a player can read only the one they want.
var VM = globalThis.VM = globalThis.VM || {};

VM.Guide = (function () {
  const L = (en, ko) => ({ en, ko });
  const PAGES = [
    { t: L('Trade routes', '교역로'), x: L('Open a route from one of your cities to another of yours, or to an ally\'s, when there is a road between them through land friendly to both. Both houses are paid every day. An enemy holding a city on the road cuts it until the road is clear. Each market in a city allows one more route from it.', '도시 하나에서 자신의 다른 도시나 동맹의 도시까지, 양쪽 모두에게 우호적인 땅을 지나는 길이 있으면 교역로를 엽니다. 두 가문 모두 매일 금을 받습니다. 적이 길 위의 도시를 차지하면 길이 열릴 때까지 끊깁니다. 시장마다 그 도시에서 교역로를 하나 더 열 수 있습니다.') },
    { t: L('Doctrines', '교리'), x: L('Once a year each house is offered three doctrines and keeps one of them for good: drill for armies, fortifications for walls and garrisons, granaries for food, levies for gold, caravans for trade, or mobility for marching. The game pauses for your choice. Houses controlled by the AI take the first one offered.', '해마다 각 가문에는 교리 셋이 주어지고, 그중 하나를 평생 지닙니다. 훈련(군대), 축성(성벽과 수비대), 곡창(식량), 징세(금), 대상(교역), 기동(행군)입니다. 선택할 때 게임이 멈춥니다. AI 가문은 처음 주어진 것을 고릅니다.') },
    { t: L('Vassals and tribute', '속국과 공물'), x: L('A much weaker house can become your vassal instead of being absorbed. It keeps its cities, officers and name, and pays you tribute every day. It cannot ally elsewhere. A vassal that grows much stronger than you rebels. Offer vassalage from the Diplomacy sheet when it is offered on a house.', '훨씬 약한 가문은 흡수되는 대신 당신의 속국이 될 수 있습니다. 도시, 장수, 이름을 지키고 매일 공물을 바칩니다. 다른 곳과 동맹할 수 없습니다. 당신보다 훨씬 강해진 속국은 반란을 일으킵니다. 외교 창에서 가문에게 속국을 제안할 수 있습니다.') },
    { t: L('Generals\' duels', '장수의 결투'), x: L('While your army is fighting an enemy army, you can challenge the enemy general to a duel. It is decided at once: the stronger general is likelier to win, and a story rival is a little stronger. The loser\'s army loses morale and its general loses loyalty. Each general rests for a while after a duel.', '적 군대와 싸우는 중에 적 장수에게 결투를 청할 수 있습니다. 결투는 즉시 가려집니다. 더 강한 장수가 이길 가능성이 크고, 이야기 속 라이벌은 조금 더 강합니다. 진 장수의 군대는 사기가 떨어지고 장수는 충성을 잃습니다. 결투 뒤 장수는 얼마간 쉽니다.') },
    { t: L('Battle reports and the Chronicle', '전투 보고서와 연대기'), x: L('Every fight is written down when it ends: the armies and their generals, their sizes at the start and the end, the place and who held the field. The Chronicle from the pause menu reads the whole game as a history book, year by year, with a summary of the current year.', '싸움이 끝나면 모두 기록됩니다. 군대와 장수, 시작과 끝의 병력, 장소, 누가 벌판을 지켰는지. 일시정지 메뉴의 연대기는 해마다 정리된 역사책처럼 게임 전체를 보여 주고, 이번 해의 요약도 담습니다.') },
    { t: L('Fog of war', '전장의 안개'), x: L('With fog on (a switch on the title screen), you see only what your cities and armies see, and their allies\' sight. Enemy armies out of sight are hidden; enemy cities out of sight show what you last saw there. The AI follows the same rules.', '안개를 켜면(제목 화면의 스위치) 당신의 도시와 군대, 동맹의 시야에 들어온 것만 보입니다. 시야 밖의 적 군대는 숨고, 시야 밖의 적 도시는 마지막으로 본 모습을 보여 줍니다. AI도 같은 규칙을 따릅니다.') },
    { t: L('Random events', '무작위 사건'), x: L('Harvests fail or bloom, plague comes, bandits gather on the roads, and a city badly kept can riot. An army standing in a city drives the bandits off. Turn the events off on the title screen if you want a quieter game.', '수확이 실패하거나 풍년이 들고, 역병이 돌고, 길에 도적이 모이며, 잘 다스려지지 않는 도시에서 소요가 일어날 수 있습니다. 도시에 주둔한 군대는 도적을 몰아냅니다. 조용한 게임을 원하면 제목 화면에서 사건을 끌 수 있습니다.') },
    { t: L('The front, the reserve and the field battle', '전선, 예비대와 야전'), x: L('Only the three biggest armies of one house fight at once in a battle or at a siege; the rest wait in reserve and step in as the front thins. Watch a battle from the army panel (Watch battle) or by tapping its red cross on the map. The view stays open until you leave it, even after the fight is over.', '한 세력의 군대 가운데 가장 큰 셋만 싸움이나 포위에서 동시에 싸웁니다. 나머지는 예비대로 기다리다가 전선이 얇아지면 들어갑니다. 군대 창의 전투 관전이나 지도의 빨간 교차 표시를 눌러 싸움을 볼 수 있습니다. 싸움이 끝나도 나갈 때까지 화면은 열려 있습니다.') },
    { t: L('Marriage, hostages and help', '혼인, 인질과 도움'), x: L('An ally can be asked for help: some of its idle armies march to a city of yours under threat. A marriage (with a dowry) binds a pact, and an exchange of hostages does too: each house holds the other\'s least valuable idle officer. A married ally does not betray you, and an AI ally will not break a pact while hostages are held.', '동맹에게 도움을 청할 수 있습니다. 놀고 있는 군대 일부가 위협받는 당신의 도시로 갑니다. 혼인(지참금 있음)과 인질 교환도 맹약을 묶습니다. 인질 교환은 서로 가장 덜 쓸모 있는 대기 장수를 상대에게 보내는 것입니다. 혼인한 동맹은 배신하지 않고, AI 동맹은 인질이 있는 동안 맹약을 깨지 않습니다.') },
    { t: L('Scenarios and save slots', '시나리오와 저장 슬롯'), x: L('Choose a start on the title screen: open ground (a random map), the fixed realm of the campaign with no story, or the siege of Vexholm. Keep up to three saved games in slots: save to one from the pause menu, and load from Saved games on the title screen. The autosave still works as before.', '제목 화면에서 시작 방식을 고르세요: 열린 땅(무작위 지도), 이야기 없는 캠페인의 고정된 나라, 또는 벡스홀름 포위. 저장 슬롯에는 최대 세 개까지 게임을 보관할 수 있습니다. 일시정지 메뉴에서 저장하고, 제목 화면의 저장된 게임에서 불러옵니다. 자동 저장은 전과 같이 작동합니다.') }
  ];
  let ui, page = 0, prev = 1, open = false;
  const $ = id => document.getElementById(id);
  const ko = () => VM.Story && VM.Story.lang() === 'ko';
  const tx = t => ko() ? t.ko : t.en;
  function render() {
    const P = PAGES[page], n = PAGES.length;
    $('storyT').textContent = tx(P.t) + ' · ' + (page + 1) + ' / ' + n;
    $('storyB').innerHTML = `<p>${tx(P.x)}</p><div class="btns" style="justify-content:space-between">` +
      `<button data-g="prev"${page === 0 ? ' disabled' : ''}>${ko() ? '이전' : 'Back'}</button>` +
      `<button class="go" data-g="next"${page === n - 1 ? ' disabled' : ''}>${ko() ? '다음' : 'Next'}</button></div>`;
    $('storyBtn').textContent = ko() ? '닫기' : 'Close'; $('storyBtn').style.display = '';
    if (VM.I18N && VM.I18N.flush) VM.I18N.flush();
  }
  function init(uiRef) {
    ui = uiRef;
    $('storyB').addEventListener('click', e => {
      const b = e.target.closest('[data-g]'); if (!b || !open) return;
      page = Math.max(0, Math.min(PAGES.length - 1, page + (b.dataset.g === 'next' ? 1 : -1))); render();
    });
    $('storyBtn').addEventListener('click', () => { if (open) close(); });
  }
  function show(from) {
    if (VM.StoryUI && VM.StoryUI.isOpen()) return;
    open = true; page = 0; prev = ui.speed || prev; if (ui.running) ui.speed = 0;
    render(); $('story').classList.add('on');
  }
  function close() { open = false; $('story').classList.remove('on'); if (ui.running && !(VM.StoryUI && VM.StoryUI.isOpen())) ui.speed = prev || 1; }
  return { init, show, close, pages: () => PAGES.length, isOpen: () => open };
})();
