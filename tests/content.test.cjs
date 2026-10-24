// Run with: node tests/content.test.cjs
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

async function runTests(source) {
  let count = 0;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const test = async (name, fn) => { try { await fn(); count++; } catch (e) { throw new Error(name + ": " + e.message); } };
  function setup() {
    const timers = [];
    const videos = [];
    const shorts = [];
    let clicks = 0;
    let reloads = 0;
    const button = { disabled: false, getAttribute: () => null, click: () => { clicks++; } };
    const document = {
      pictureInPictureElement: null, documentElement: {},
      querySelectorAll: () => shorts,
      querySelector: selector => selector.includes("navigation-button") ? button :
        selector.startsWith(".reel-video-in-sequence") ? shorts[0] || null : null,
      getElementById: id => shorts.find(short => short.id === id) || null,
      addEventListener() {},
    };
    const chrome = { storage: {
      local: { get() {}, onChanged: { addListener() {} } },
      onChanged: { addListener() {} },
    } };
    const window = { innerHeight: 800, location: { reload: () => { reloads++; } }, scrollBy() {} };
    function makeShort(id, active = false) {
      const listeners = new Map();
      const video = {
        paused: false, readyState: 4, loop: true, pipRequests: 0, plays: 0,
        removeAttribute(name) { if (name === "loop") this.loop = false; },
        setAttribute(name) { if (name === "loop") this.loop = true; },
        hasAttribute(name) { return name === "loop" && this.loop; },
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
        async play() { this.plays++; this.paused = false; },
        async requestPictureInPicture() { this.pipRequests++; document.pictureInPictureElement = this; },
        listeners,
      };
      const short = {
        id: String(id), active, isConnected: true, video, scrolls: [],
        hasAttribute(name) { return name === "is-active" && this.active; },
        querySelector(selector) {
          if (selector === "video") return this.video;
          if (selector === "#player") return {};
          return null;
        },
        contains(element) { return element === this.video; },
        scrollIntoView(options) { this.scrolls.push(options); },
      };
      shorts.push(short); videos.push(video);
      return short;
    }
    const api = new Function("document", "chrome", "window", "MutationObserver",
      "setInterval", "setTimeout", "console", source + `
      waitForAllMetadata = async () => ({isAd:false, metaDataLoaded:false});
      checkShortValidity = async () => true;
      return {checkForNewShort, startAutoScrolling, stopAutoScrolling, shortEnded,
        scrollToNextShort, findShortContainer, syncPictureInPicture,
        configure(options) {
          if ('on' in options) applicationIsOn = options.on;
          if ('id' in options) currentShortId = options.id;
          if ('video' in options) currentVideoElement = options.video;
          if ('direction' in options) scrollDirection = options.direction;
          if ('delay' in options) additionalScrollDelay = options.delay;
          if ('plays' in options) amountOfPlaysToSkip = options.plays;
        },
        missingNext() { waitForNextShort = async () => null; },
        get video() { return currentVideoElement; },
        get amount() { return amountOfPlays; }
      };`
    )(document, chrome, window, class { observe() {} }, () => {},
      callback => { timers.push(callback); return timers.length; },
      { log() {}, info() {} });
    return {api, document, shorts, makeShort, button, timers,
      get clicks() { return clicks; }, get reloads() { return reloads; },
      async tick() { const fn = timers.shift(); assert(fn, "expected scheduled timer"); fn(); await Promise.resolve(); }
    };
  }

  await test("explicit next lookup never returns current or a preloaded unrelated Short", () => {
    const h = setup(); h.makeShort(0, true); h.makeShort(3);
    assert(h.api.findShortContainer(1) === null, "missing next must be null");
    assert(h.api.findShortContainer(3).id === "3", "exact ID lookup");
  });
  await test("active Short takes priority over preloaded players and old PiP video", () => {
    const h = setup(); const old = h.makeShort(0); const next = h.makeShort(1, true);
    h.document.pictureInPictureElement = old.video;
    assert(h.api.findShortContainer() === next, "must select active Short");
  });
  await test("PiP navigation clicks next without smooth scrolling", async () => {
    const h = setup(); const short = h.makeShort(0, true);
    h.api.configure({on:true, id:0, video:short.video});
    h.document.pictureInPictureElement = short.video;
    const pending = h.api.scrollToNextShort(0); await h.tick(); await pending;
    assert(h.clicks === 1 && short.scrolls.length === 0 && h.reloads === 0, "direct PiP navigation");
  });
  await test("reverse PiP navigation selects the up button", async () => {
    const h = setup(); const short = h.makeShort(1, true);
    h.api.configure({on:true, id:1, video:short.video, direction:-1});
    h.document.pictureInPictureElement = short.video;
    let selector;
    h.document.querySelector = value => { if (value.includes("navigation-button")) { selector = value; return h.button; } return value.startsWith(".reel-video-in-sequence") ? h.shorts[0] : null; };
    const pending = h.api.scrollToNextShort(1); await h.tick(); await pending;
    assert(selector.includes("navigation-button-up") && h.clicks === 1, "reverse button");
  });
  await test("regular playback retains smooth scrolling", async () => {
    const h = setup(); const short = h.makeShort(0, true); const next = h.makeShort(1);
    h.api.configure({on:true, id:0, video:short.video});
    const pending = h.api.scrollToNextShort(0); await h.tick(); await pending;
    assert(next.scrolls[0].behavior === "smooth", "regular scroll behavior");
  });
  await test("PiP fallback uses instant scrolling when navigation is unavailable", async () => {
    const h = setup(); const short = h.makeShort(0, true); const next = h.makeShort(1);
    h.document.pictureInPictureElement = short.video; h.button.disabled = true;
    h.api.configure({on:true, id:0, video:short.video});
    const pending = h.api.scrollToNextShort(0); await h.tick(); await pending;
    assert(next.scrolls[0].behavior === "instant", "PiP scroll behavior");
  });
  await test("stopping during a delay cancels navigation", async () => {
    const h = setup(); const short = h.makeShort(0, true); const next = h.makeShort(1);
    h.api.configure({on:true, id:0, video:short.video, delay:1000});
    const pending = h.api.scrollToNextShort(0); h.api.stopAutoScrolling();
    await h.tick(); await pending;
    assert(h.clicks === 0 && next.scrolls.length === 0, "must not navigate after stop");
  });
  await test("duplicate ended events schedule just one advance", async () => {
    const h = setup(); const short = h.makeShort(0, true);
    h.api.configure({on:true, id:0, video:short.video}); h.document.pictureInPictureElement = short.video;
    const event = {preventDefault() {}, currentTarget:short.video};
    h.api.shortEnded(event); h.api.shortEnded(event);
    assert(h.timers.length === 1, "one pending advance");
    await h.tick(); await Promise.resolve();
    assert(h.clicks === 1, "one navigation");
  });
  await test("repeat count and stale video events are respected", () => {
    const h = setup(); const short = h.makeShort(0, true);
    h.api.configure({on:true, id:0, video:short.video, plays:2});
    h.api.shortEnded({preventDefault() {}, currentTarget:{}});
    assert(h.api.amount === 0, "ignore old video");
    h.api.shortEnded({preventDefault() {}, currentTarget:short.video});
    assert(h.api.amount === 1 && short.video.plays === 1 && h.timers.length === 0, "repeat first play");
  });
  await test("replacement video in the same Short gets a listener and PiP transfer", async () => {
    const h = setup(); const short = h.makeShort(0, true); const oldVideo = {};
    h.api.configure({on:true, id:0, video:oldVideo});
    oldVideo.removeEventListener = () => {};
    h.document.pictureInPictureElement = oldVideo;
    await h.api.checkForNewShort();
    assert(h.api.video === short.video && short.video.listeners.has("ended"), "rebind replacement");
    assert(!short.video.loop && short.video.pipRequests === 1, "transfer PiP and remove loop");
  });
  await test("closing PiP never causes it to reopen", async () => {
    const h = setup(); const short = h.makeShort(0, true);
    h.api.configure({on:true, id:0, video:short.video});
    await h.api.syncPictureInPicture();
    assert(short.video.pipRequests === 0, "no session means no request");
  });
  await test("PiP transfer failures are contained and not repeatedly requested", async () => {
    const h = setup(); const short = h.makeShort(0, true);
    h.api.configure({on:true, id:0, video:short.video}); h.document.pictureInPictureElement = {};
    short.video.requestPictureInPicture = async () => { short.video.pipRequests++; throw new Error("NotAllowedError"); };
    await h.api.syncPictureInPicture(); await h.api.syncPictureInPicture();
    assert(short.video.pipRequests === 1, "one attempt per replacement video");
  });
  await test("PiP is not reloaded away when the next Short is missing", async () => {
    const h = setup(); const short = h.makeShort(0, true);
    h.api.configure({on:true, id:0, video:short.video});
    h.document.pictureInPictureElement = short.video; h.button.disabled = true; h.api.missingNext();
    const pending = h.api.scrollToNextShort(0); await h.tick(); await pending;
    assert(h.reloads === 0, "preserve PiP session");
  });
  await test("stale delayed navigation is cancelled after the active Short changes", async () => {
    const h = setup(); const old = h.makeShort(0, true); const next = h.makeShort(1);
    h.api.configure({on:true, id:0, video:old.video, delay:1000});
    const pending = h.api.scrollToNextShort(0);
    old.active = false; next.active = true; await h.api.checkForNewShort();
    await h.tick(); await pending;
    assert(next.scrolls.length === 0 && h.api.video === next.video, "ignore stale advance");
  });
  await test("stopping while comments are open cancels the waiting navigation", async () => {
    const h = setup(); const short = h.makeShort(0, true); const next = h.makeShort(1);
    h.api.configure({on:true, id:0, video:short.video});
    const comments = {getAttribute: () => "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"};
    h.document.querySelector = selector => selector.startsWith(".reel-video-in-sequence") ?
      h.shorts[0] : selector.startsWith("ytd-engagement") ? comments : null;
    const pending = h.api.scrollToNextShort(0);
    h.api.stopAutoScrolling(); await h.tick(); await pending;
    assert(next.scrolls.length === 0 && h.reloads === 0, "stop comment wait");
  });
  await test("new active video is played when YouTube initially pauses it", async () => {
    const h = setup(); const short = h.makeShort(0, true);
    short.video.paused = true; h.api.configure({on:true});
    await h.api.checkForNewShort();
    assert(short.video.plays === 1 && !short.video.paused, "resume new video");
  });
  await test("already active PiP video is not requested again", async () => {
    const h = setup(); const short = h.makeShort(0, true);
    h.api.configure({on:true, video:short.video}); h.document.pictureInPictureElement = short.video;
    await h.api.syncPictureInPicture();
    assert(short.video.pipRequests === 0, "keep existing PiP");
  });
  return count;
}

const source = readFileSync(join(__dirname, "../extension/dist/content.js"), "utf8");
runTests(source).then(count => {
  console.log(`Passed ${count} content-script regression tests.`);
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
