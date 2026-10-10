// 星座の由来の「🔊 読んでもらう」（yorozu-plans ROADMAP 7.36.1 K140）。ビルド時に作った録音（shinwa/audio/<話>.mp3）を、押したときに読んで鳴らす。
// ページの最初の読み込みには音声を入れない（preload しない）。止めるか終われば捨てる。サーバーには何も送らない。
(function () {
  'use strict';
  var IDLE = '🔊 読んでもらう', PLAYING = '■ 止める';
  Array.prototype.forEach.call(document.querySelectorAll('button[data-audio]'), function (b) {
    var audio = null;
    function stop() {
      if (audio) { audio.onended = audio.onerror = null; try { audio.pause(); } catch (e) { /* 止められなくても続ける */ } audio = null; }
      b.textContent = IDLE;
      b.classList.remove('playing');
    }
    b.addEventListener('click', function () {
      if (audio) { stop(); return; }
      audio = new Audio(b.getAttribute('data-audio'));
      audio.onended = stop;
      audio.onerror = function () { stop(); b.textContent = '読めませんでした（もう一度押す）'; };
      b.textContent = PLAYING;
      b.classList.add('playing');
      audio.play().catch(function () { if (audio) audio.onerror(); });
    });
  });
})();
