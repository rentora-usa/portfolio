/* =========================================================
   ENGLISH QUEST — game logic
   Handles: the save file, XP, stage completion, level
   unlocking, and the (optional) sound effects.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- save file -------------------------------------------------
     Uses localStorage when the browser allows it. Opening the site straight
     off the hard drive can block storage, so we fall back to memory and the
     page still works — progress just resets on reload.
  --------------------------------------------------------------------- */

  var KEY = "englishquest.save";
  var memory = {};
  var canStore = (function () {
    try {
      window.localStorage.setItem("__test", "1");
      window.localStorage.removeItem("__test");
      return true;
    } catch (e) {
      return false;
    }
  })();

  function loadSave() {
    if (!canStore) return memory;
    try {
      return JSON.parse(window.localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeSave(data) {
    memory = data;
    if (!canStore) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* storage full or blocked — keep going with the in-memory copy */
    }
  }

  var save = loadSave();

  /* ---------- sound -----------------------------------------------------
     Off until the visitor turns it on. Three short square-wave blips made
     with the Web Audio API, so there are no audio files to ship.
  --------------------------------------------------------------------- */

  var audio = null;
  var soundOn = save.sound === true;

  function blip(freq, ms) {
    if (!soundOn) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audio.createOscillator();
      var gain = audio.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.04;
      osc.connect(gain).connect(audio.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
      osc.stop(audio.currentTime + ms / 1000);
    } catch (e) {
      /* no audio available — silent is fine */
    }
  }

  var sfx = {
    move: function () { blip(520, 70); },
    select: function () { blip(760, 90); },
    complete: function () { blip(660, 90); setTimeout(function () { blip(990, 160); }, 90); },
    locked: function () { blip(160, 180); }
  };

  /* ---------- stages ----------------------------------------------------
     Every stage on a quarter page carries data-stage="q1-formal" etc.
     Completing all the stages in a quarter unlocks the next one.
  --------------------------------------------------------------------- */

  var QUARTERS = {
    q1: ["q1-formal", "q1-informal", "q1-sharp", "q1-stretch", "q1-journal"]
  };

  function isDone(id) {
    return save[id] === true;
  }

  function quarterCleared(q) {
    var list = QUARTERS[q];
    if (!list) return false;
    return list.every(isDone);
  }

  function countDone(q) {
    var list = QUARTERS[q] || [];
    return list.filter(isDone).length;
  }

  /* ---------- HUD -------------------------------------------------------- */

  function paintHud() {
    var total = 0, done = 0;
    Object.keys(QUARTERS).forEach(function (q) {
      total += QUARTERS[q].length;
      done += countDone(q);
    });

    var pct = total ? Math.round((done / total) * 100) : 0;

    var fill = document.querySelector("[data-xp-fill]");
    if (fill) fill.style.width = pct + "%";

    var label = document.querySelector("[data-xp-label]");
    if (label) label.textContent = done + "/" + total;

    var score = document.querySelector("[data-score]");
    if (score) score.textContent = String(done * 1250).padStart(6, "0");
  }

  /* ---------- stage buttons ---------------------------------------------- */

  function wireStages() {
    var stages = document.querySelectorAll("[data-stage]");

    Array.prototype.forEach.call(stages, function (stage) {
      var id = stage.getAttribute("data-stage");
      var btn = stage.querySelector("[data-complete]");
      if (!btn) return;

      function paint() {
        var done = isDone(id);
        stage.setAttribute("data-done", done ? "true" : "false");
        btn.setAttribute("aria-pressed", done ? "true" : "false");
        btn.textContent = done ? "Cleared" : "Mark cleared";
      }

      btn.addEventListener("click", function () {
        var next = !isDone(id);
        save[id] = next;
        writeSave(save);
        paint();
        paintHud();
        if (next) { sfx.complete(); } else { sfx.move(); }
      });

      paint();
    });
  }

  /* ---------- level map -------------------------------------------------- */

  function wireMap() {
    var nodes = document.querySelectorAll("[data-level]");

    Array.prototype.forEach.call(nodes, function (node) {
      var level = node.getAttribute("data-level");
      var needs = node.getAttribute("data-requires");
      var status = node.querySelector(".node__status");

      // Quarter 1 is always open. Later quarters are still being built,
      // so they stay locked and say so.
      var open = level === "q1";

      if (open) {
        node.classList.add("node--open");
        if (status) {
          status.textContent = quarterCleared("q1")
            ? "Cleared \u2014 " + countDone("q1") + "/5"
            : "Open \u2014 " + countDone("q1") + "/5 stages";
        }
        node.addEventListener("mouseenter", sfx.move);
        node.addEventListener("click", sfx.select);
      } else {
        node.classList.add("node--locked");
        node.setAttribute("aria-disabled", "true");
        if (status) {
          status.textContent = needs && quarterCleared(needs)
            ? "In development"
            : "In development";
        }
        node.addEventListener("mouseenter", function () {
          var note = document.querySelector("[data-locked-note]");
          if (note) {
            note.textContent =
              "Level " + level.replace("q", "") +
              " is in development. Quarter " +
              (parseInt(level.replace("q", ""), 10) - 1) +
              " has to be cleared first anyway.";
          }
        });
        node.addEventListener("click", sfx.locked);
      }
    });
  }

  /* ---------- sound toggle ------------------------------------------------ */

  function wireSound() {
    var btn = document.querySelector("[data-sound]");
    if (!btn) return;

    function paint() {
      btn.setAttribute("aria-pressed", soundOn ? "true" : "false");
      btn.textContent = soundOn ? "SFX on" : "SFX off";
    }

    btn.addEventListener("click", function () {
      soundOn = !soundOn;
      save.sound = soundOn;
      writeSave(save);
      paint();
      if (soundOn) sfx.select();
    });

    paint();
  }

  /* ---------- reset save --------------------------------------------------- */

  function wireReset() {
    var btn = document.querySelector("[data-reset]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (!window.confirm("Erase your progress and start the quarter over?")) return;
      save = { sound: soundOn };
      writeSave(save);
      window.location.reload();
    });
  }

  /* ---------- boot --------------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", function () {
    wireStages();
    wireMap();
    wireSound();
    wireReset();
    paintHud();
  });
})();
