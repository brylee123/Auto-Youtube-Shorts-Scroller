// ------------------------------
// CONSTANT SELECTORS VARIABLES
// ------------------------------
const VIDEOS_LIST_SELECTORS = [
  ".reel-video-in-sequence",
  ".reel-video-in-sequence-new",
];
const CURRENT_SHORT_SELECTOR = "ytd-reel-video-renderer";
const LIKE_BUTTON_SELECTOR =
  "like-button-view-model > toggle-button-view-model > button-view-model > label > button";
const DISLIKE_BUTTON_SELECTOR =
  "dislike-button-view-model > toggle-button-view-model > button-view-model > label > button";
const COMMENTS_SELECTORS = [
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
  '#title-text[title="Comments"]',
];
const LIKES_COUNT_SELECTOR =
  "#factoids > factoid-renderer:nth-child(1) > div > span.ytwFactoidRendererValue > span";
const VIEW_COUNT_SELECTOR =
  "#factoids > view-count-factoid-renderer > factoid-renderer > div > span.ytwFactoidRendererValue > span";
const COMMENTS_COUNT_SELECTORS = [
  "#comments-button > ytd-button-renderer > yt-button-shape > label > div > span",
  "#button-bar > reel-action-bar-view-model > button-view-model:nth-of-type(1) > label > div > span",
  "reel-action-bar-view-model > button-view-model:nth-child(3) > label > div > span",
];
const DESCRIPTION_TAGS_SELECTOR = "#title > yt-formatted-string > a";
const AUTHOUR_NAME_SELECTOR =
  "yt-reel-metapanel-view-model yt-reel-channel-bar-view-model > span > a";

const AUTHOR_SUBSCRIBE_BUTTON_SELECTOR =
  "yt-subscribe-button-view-model > yt-animated-action > div > div > button > div";
const AUTHOR_SUBSCRIBE_JOIN_BUTTON_SELECTOR =
  "yt-reel-channel-bar-view-model button-view-model > button > div";

const SPONSERED_REEL_SELECTOR = "ad-badge-view-model";

const NEXT_BUTTON_SELECTOR =
  "#navigation-button-down > ytd-button-renderer > yt-button-shape > button";
const PREVIOUS_BUTTON_SELECTOR =
  "#navigation-button-up > ytd-button-renderer > yt-button-shape > button";

// ------------------------------
// APP VARIABLES
// ------------------------------
let shortCutToggleKeys = [];
let shortCutInteractKeys = [];
let scrollOnCommentsCheck = false;
let scrollDirection = 1;
let amountOfPlays = 0;
let amountOfPlaysToSkip = 1;
let filterMinLength = "none";
let filterMaxLength = "none";
let filterMinViews = "none";
let filterMaxViews = "none";
let filterMinLikes = "none";
let filterMaxLikes = "none";
let filterMinComments = "none";
let filterMaxComments = "none";
let blockedCreators = [];
let whitelistedCreators = [];
let whitelistSubscriptions = false;
let blockedTags = [];
let scrollOnNoTags = false;
let additionalScrollDelay = 0;

// ------------------------------
// STATE VARIABLES
// ------------------------------
let currentShortId = null;
let previousMetaData = { creatorName: null, viewCount: "" };
let currentVideoElement = null;
let applicationIsOn = false;
let bindingGeneration = 0;
let bindingShort = null;
let pendingScroll = null;
let pipTransferPending = false;
let pipTransferWarningShown = false;
let pipTransferFailedVideo = null;

const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 500;

// ------------------------------
// MAIN FUNCTIONS
// ------------------------------
function startAutoScrolling() {
  if (!applicationIsOn) {
    applicationIsOn = true;
    amountOfPlays = 0;
    currentShortId = null;
    currentVideoElement = null;
  }
  checkForNewShort();
}

function stopAutoScrolling() {
  applicationIsOn = false;
  bindingGeneration++;
  bindingShort = null;
  pendingScroll = null;
  amountOfPlays = 0;
  if (currentVideoElement) {
    currentVideoElement.setAttribute("loop", "true");
    currentVideoElement.removeEventListener("ended", shortEnded);
    currentVideoElement._hasEndEvent = false;
  }
}

async function checkForNewShort() {
  if (!applicationIsOn || !isShortsPage()) return;
  const currentShort = findShortContainer();
  if (!currentShort) return;
  const video = currentShort.querySelector("video");
  if (bindingShort === currentShort) return;
  if (currentShort.id != currentShortId || video !== currentVideoElement) {
    const generation = ++bindingGeneration;
    bindingShort = currentShort;
    pendingScroll = null;
    if (currentVideoElement) {
      currentVideoElement.removeEventListener("ended", shortEnded);
      currentVideoElement._hasEndEvent = false;
    }
    if (currentShort.id != currentShortId) amountOfPlays = 0;
    currentShortId = parseInt(currentShort.id);
    currentVideoElement = null;
    try {
      const nextVideo = await waitForVideoElement(currentShort, currentShortId);
      if (!applicationIsOn || generation !== bindingGeneration) return;
      currentVideoElement = nextVideo;
      if (!nextVideo) {
        // A reload would close PiP. Leave recovery to the next DOM update.
        currentShortId = null;
        return;
      }
      nextVideo.removeAttribute("loop");
      nextVideo.addEventListener("ended", shortEnded);
      nextVideo._hasEndEvent = true;
      bindingShort = null;
      syncPictureInPicture(nextVideo);
      // YouTube may pause a newly selected Short while its tab is hidden.
      if (nextVideo.paused && applicationIsOn) {
        try { await nextVideo.play(); } catch {}
      }
      const metaDataInformation = await waitForAllMetadata(currentShort);
      if (!applicationIsOn || generation !== bindingGeneration) return;
      if (metaDataInformation.isAd) return scrollToNextShort(currentShortId, false);
      const isValidShort = await checkShortValidity(currentShort);
      if (!applicationIsOn || generation !== bindingGeneration) return;
      if (metaDataInformation.metaDataLoaded && !isValidShort) {
        return scrollToNextShort(currentShortId, true);
      }
    } finally {
      if (generation === bindingGeneration) bindingShort = null;
    }
  }
  if (currentVideoElement && applicationIsOn) {
    currentVideoElement.removeAttribute("loop");
    syncPictureInPicture(currentVideoElement);
  }
}

function shortEnded(e) {
  e.preventDefault();
  if (!applicationIsOn || e.currentTarget !== currentVideoElement || pendingScroll) return;
  amountOfPlays++;
  if (amountOfPlays >= amountOfPlaysToSkip) {
    amountOfPlays = 0;
    scrollToNextShort(currentShortId);
  } else {
    currentVideoElement.play().catch(() => {});
  }
}

async function scrollToNextShort(prevShortId = null, useDelayAndCheckComments = true) {
  if (!applicationIsOn || !isShortsPage() || pendingScroll) return;
  const request = {};
  const generation = bindingGeneration;
  pendingScroll = request;
  const isCurrent = () => applicationIsOn && isShortsPage() &&
    pendingScroll === request && generation === bindingGeneration &&
    (prevShortId == null || prevShortId == currentShortId);
  try {
    const comments = document.querySelector(COMMENTS_SELECTORS[0]);
    const isCommentsOpen = () => {
      const title = document.querySelector(COMMENTS_SELECTORS[1]);
      const rect = title?.getBoundingClientRect();
      return comments?.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED" ||
        !!comments?.querySelector("[panel-target-id='engagement-panel-comments-section'][panel-content-visible]") ||
        !!(rect && rect.top < window.innerHeight && rect.bottom > 0);
    };
    if (useDelayAndCheckComments && !scrollOnCommentsCheck && isCommentsOpen()) {
      useDelayAndCheckComments = false;
      while (isCurrent() && !scrollOnCommentsCheck && isCommentsOpen()) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (!isCurrent()) return;
    if (useDelayAndCheckComments && additionalScrollDelay > 0) {
      currentVideoElement?.play().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, additionalScrollDelay));
    } else {
      // Defer until the ended event has finished dispatching.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!isCurrent()) return;

    if (document.pictureInPictureElement) {
      // Direct navigation works without a smooth-scroll animation in a hidden tab.
      const button = document.querySelector(
        scrollDirection === 1 ? NEXT_BUTTON_SELECTOR : PREVIOUS_BUTTON_SELECTOR
      ) as HTMLButtonElement;
      if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
        button.click();
        checkForNewShort();
        return;
      }
    }

    const nextShort = await waitForNextShort();
    if (!isCurrent()) return;
    if (!nextShort) {
      if (!document.pictureInPictureElement) window.location.reload();
      return;
    }
    nextShort.scrollIntoView({
      behavior: document.pictureInPictureElement ? "instant" : "smooth",
      block: "nearest",
      inline: "start",
    });
    checkForNewShort();
  } finally {
    if (pendingScroll === request) pendingScroll = null;
  }
}

// Transfer only while a PiP session exists. Closing PiP must never reopen it.
async function syncPictureInPicture(video = currentVideoElement) {
  const pipVideo = document.pictureInPictureElement;
  if (!applicationIsOn || !isShortsPage() || !video || !pipVideo ||
      pipVideo === video || pipTransferPending || pipTransferFailedVideo === video || video.readyState < 2 ||
      typeof video.requestPictureInPicture !== "function") return;
  pipTransferPending = true;
  try {
    await video.requestPictureInPicture();
  } catch (error) {
    pipTransferFailedVideo = video;
    if (!pipTransferWarningShown) {
      pipTransferWarningShown = true;
      console.info("[Auto Youtube Shorts Scroller] Chrome could not transfer PiP. Reopen PiP on the current Short.", error);
    }
  } finally {
    pipTransferPending = false;
  }
}

function findShortContainer(id = null) {
  let shorts = [];
  for (const selector of VIDEOS_LIST_SELECTORS) {
    shorts = [...document.querySelectorAll(selector)];
    if (shorts.length) break;
  }
  // An explicit lookup must not fall back to the current or an unrelated Short.
  if (id != null) {
    return shorts.find(short => short.id === String(id)) ||
      document.getElementById(String(id));
  }
  // Preloaded Shorts may also contain a player. Prefer YouTube's active marker.
  const active = shorts.find(short =>
    short.hasAttribute("is-active") || short.querySelector("[is-active]"));
  if (active) return active;
  const pipVideo = document.pictureInPictureElement;
  const pipShort = pipVideo && shorts.find(short => short.contains(pipVideo));
  if (pipShort) return pipShort;
  return shorts.find(short => short.querySelector("#player") ||
    short.querySelector(CURRENT_SHORT_SELECTOR)) || shorts[0] ||
    document.getElementById(String(currentShortId || 0));
}

async function waitForNextShort(retries = 5, delay = 500) {
  if (!isShortsPage()) return null;
  for (let i = 0; i < retries; i++) {
    // Find the next short container
    const nextShort = findShortContainer(currentShortId + scrollDirection);
    if (nextShort) return nextShort;

    // If none found, little slight screen shake to trigger hydration of new shorts
    window.scrollBy(0, 100);
    await new Promise((r) => setTimeout(r, delay));
    window.scrollBy(0, -100);
    await new Promise((r) => setTimeout(r, delay));
  }

  console.log(
    "[Auto Youtube Shorts Scroller] The next short has not loaded in, reloading page..."
  );
  return null;
}

async function checkShortValidity(currentShort: HTMLDivElement) {
  const videoLength = currentVideoElement?.duration;
  const viewCount = document.querySelector(
    VIEW_COUNT_SELECTOR
  ) as HTMLSpanElement;
  const likeCount = document.querySelector(
    LIKES_COUNT_SELECTOR
  ) as HTMLSpanElement;
  const commentCount =
    (currentShort &&
      (currentShort.querySelector(
        COMMENTS_COUNT_SELECTORS.join(",")
      ) as HTMLSpanElement)) ||
    (document.querySelector(
      COMMENTS_COUNT_SELECTORS.join(",")
    ) as HTMLSpanElement);
  const tags = document.querySelectorAll(
    DESCRIPTION_TAGS_SELECTOR
  ) as NodeListOf<HTMLAnchorElement>;
  const creatorName =
    currentShort &&
    (currentShort.querySelector(AUTHOUR_NAME_SELECTOR) as HTMLAnchorElement);
  const subscribeButton =
    currentShort &&
    currentShort.querySelector(AUTHOR_SUBSCRIBE_BUTTON_SELECTOR);
  const joinButton =
    currentShort &&
    currentShort.querySelector(AUTHOR_SUBSCRIBE_JOIN_BUTTON_SELECTOR);
  const isSubscribed =
    !!subscribeButton?.innerHTML.toLowerCase().includes("subscribed") ||
    !!joinButton?.innerHTML.toLowerCase().includes("join");

  console.log("[Auto Youtube Shorts Scroller] Filters:", {
    filters: [
      { videoLength, filterMinLength, filterMaxLength },
      { viewCount: viewCount?.innerText, filterMinViews, filterMaxViews },
      { likeCount: likeCount?.innerText, filterMinLikes, filterMaxLikes },
      {
        commentCount: commentCount?.innerText,
        filterMinComments,
        filterMaxComments,
      },
      { tags: [...tags].map((tag) => tag.innerText) },
      { creatorName: creatorName?.innerText },
      { blockedTags },
      { blockedCreators },
      { whitelistedCreators },
      {
        whitelistSubscriptions,
        isSubscribed: isSubscribed,
      },
      {
        isSponsered: !!currentShort.querySelector(SPONSERED_REEL_SELECTOR),
      },
    ],
  });

  if (!creatorName || !commentCount) return true; // If creator name or comment count is not found, return true to avoid false blocking

  // Ignores all checks if whitelisted creator
  if (whitelistedCreators.length > 0) {
    const creator = creatorName.innerText.trim().toLowerCase();
    if (
      whitelistedCreators.map((cr) => cr.toLowerCase()).includes(creator) ||
      whitelistedCreators
        .map((cr) => cr.toLowerCase())
        .includes(creator.replace("@", ""))
    ) {
      return true;
    }
  }

  // Ignores all checks if whitelisted by subscription
  if (whitelistSubscriptions && isSubscribed) {
    return true;
  }

  if (!checkValidVideoLength(videoLength)) return false;
  if (viewCount && !checkValidViewCount(viewCount)) return false;
  if (likeCount && !checkValidLikeCount(likeCount)) return false;
  if (!checkValidCommentCount(commentCount)) return false;
  if (!checkValidTags(tags)) return false;
  if (!checkValidCreator(creatorName)) return false;

  function checkValidVideoLength(videoLength: number) {
    if (filterMinLength !== "none" && videoLength < parseInt(filterMinLength))
      return false;
    if (filterMaxLength !== "none" && videoLength > parseInt(filterMaxLength))
      return false;
    return true;
  }

  function checkValidViewCount(viewCount: HTMLSpanElement) {
    const viewCountText = viewCount.innerText
      .trim()
      .toLowerCase()
      .replaceAll(",", "");
    const filterMinViewsParsed = parseTextToNumber(filterMinViews);
    const filterMaxViewsParsed = parseTextToNumber(filterMaxViews);
    if (
      filterMinViews !== "none" &&
      parseInt(viewCountText) < filterMinViewsParsed
    )
      return false;
    if (
      filterMaxViews !== "none" &&
      parseInt(viewCountText) > filterMaxViewsParsed
    )
      return false;
    return true;
  }

  function checkValidLikeCount(likeCount: HTMLSpanElement) {
    const likeNum = parseTextToNumber(likeCount.innerText);
    const filterMinLikesParsed = parseTextToNumber(filterMinLikes);
    const filterMaxLikesParsed = parseTextToNumber(filterMaxLikes);
    if (filterMinLikes !== "none" && likeNum < filterMinLikesParsed)
      return false;
    if (filterMaxLikes !== "none" && likeNum > filterMaxLikesParsed)
      return false;
    return true;
  }

  function checkValidCommentCount(commentCount: HTMLSpanElement) {
    const commentNum = parseTextToNumber(commentCount.innerText);
    const filterMinCommentsParsed = parseTextToNumber(filterMinComments);
    const filterMaxCommentsParsed = parseTextToNumber(filterMaxComments);

    if (filterMinComments !== "none" && commentNum < filterMinCommentsParsed)
      return false;
    if (filterMaxComments !== "none" && commentNum > filterMaxCommentsParsed)
      return false;
    return true;
  }

  function checkValidTags(tags: NodeListOf<HTMLAnchorElement>) {
    if (tags.length === 0 && scrollOnNoTags) return false;
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i].innerText.toLowerCase();
      if (
        blockedTags.map((bTag) => bTag.toLowerCase()).includes(tag) ||
        blockedTags
          .map((bTag) => bTag.toLowerCase())
          .includes(tag.replace("#", ""))
      )
        return false;
    }
    return true;
  }

  function checkValidCreator(creatorName: HTMLAnchorElement) {
    const creator = creatorName.innerText.trim().toLowerCase();
    if (
      blockedCreators.map((cr) => cr.toLowerCase()).includes(creator) ||
      blockedCreators
        .map((cr) => cr.toLowerCase())
        .includes(creator.replace("@", ""))
    )
      return false;
    return true;
  }

  // If all checks pass, return true
  return true;
}

function checkIfShortIsSponsered(currentShort: HTMLDivElement) {}

async function waitForVideoElement(currentShort, shortId) {
  for (let tries = 0; tries <= MAX_RETRIES; tries++) {
    if (!applicationIsOn || currentShortId !== shortId || !currentShort.isConnected) return null;
    const video = currentShort.querySelector("video");
    if (video) return video;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return null;
}
async function waitForAllMetadata(
  currentShort: HTMLElement
): Promise<{ isAd: boolean; metaDataLoaded: boolean }> {
  let tries = 0;

  while (tries < MAX_RETRIES) {
    // Ad check first — return immediately if detected, no need to wait for metadata
    if (currentShort.querySelector(SPONSERED_REEL_SELECTOR)) {
      return { isAd: true, metaDataLoaded: false };
    }

    const creatorEl = currentShort.querySelector(AUTHOUR_NAME_SELECTOR);
    const viewsEl = document.querySelector(
      VIEW_COUNT_SELECTOR
    ) as HTMLSpanElement;

    const data = {
      creatorName: creatorEl?.textContent?.trim() || "",
      viewCount: viewsEl?.textContent?.trim() || "",
    };

    const hasAllElements = creatorEl && viewsEl;
    const hasValidText =
      data.creatorName.length > 0 && data.viewCount.length > 0;
    const isDifferentFromPrevious =
      !previousMetaData ||
      data.creatorName !== previousMetaData.creatorName ||
      data.viewCount !== previousMetaData.viewCount;

    if (hasAllElements && hasValidText && isDifferentFromPrevious) {
      previousMetaData = {
        creatorName: data.creatorName,
        viewCount: data.viewCount,
      };
      return { isAd: false, metaDataLoaded: true };
    }

    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    tries++;
  }

  console.log(
    "[Auto Youtube Shorts Scroller] Metadata failed to hydrate properly, some filters may not work for this short."
  );
  return { isAd: false, metaDataLoaded: false };
}

// ------------------------------
// INITIATION AND SETTINGS FETCH
// ------------------------------
(function initiate() {
  chrome.storage.local.get(["applicationIsOn"], (result) => {
    if (result["applicationIsOn"] == null) return startAutoScrolling();
    if (result["applicationIsOn"]) startAutoScrolling();
  });

  checkForNewShort();
  checkApplicationState();

  setInterval(checkForNewShort, RETRY_DELAY_MS);
  // Media/DOM events continue to identify new videos without relying only on
  // the polling timer, which Chrome can throttle when the tab is in the background.
  const onVideoChange = () => { checkForNewShort(); };
  document.addEventListener("loadeddata", onVideoChange, true);
  document.addEventListener("play", onVideoChange, true);
  document.addEventListener("enterpictureinpicture", onVideoChange, true);
  document.addEventListener("visibilitychange", onVideoChange);
  new MutationObserver(onVideoChange).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["is-active"],
  });


  function checkApplicationState() {
    chrome.storage.local.get(["applicationIsOn"], (result) => {
      if (applicationIsOn && result["applicationIsOn"] === false) {
        stopAutoScrolling();
      } else if (result["applicationIsOn"] === true) {
        startAutoScrolling();
      }
    });
  }

  (function onApplicationChange() {
    chrome.storage.local.onChanged.addListener((changes) => {
      if (changes["applicationIsOn"]?.newValue) {
        startAutoScrolling();
      } else if (changes["applicationIsOn"]?.newValue === false) {
        stopAutoScrolling();
      }
    });
  })();

  (function getAllSettings() {
    chrome.storage.local.get(
      [
        "shortCutKeys",
        "shortCutInteractKeys",
        "scrollDirection",
        "amountOfPlaysToSkip",
        "filterByMinLength",
        "filterByMaxLength",
        "filterByMinViews",
        "filterByMaxViews",
        "filterByMinLikes",
        "filterByMaxLikes",
        "filterByMinComments",
        "filterByMaxComments",
        "filteredAuthors",
        "filteredTags",
        "scrollOnComments",
        "scrollOnNoTags",
        "whitelistedAuthors",
        "whitelistSubscriptions",
        "additionalScrollDelay",
      ],
      (result) => {
        console.log("[Auto Youtube Shorts Scroller]", {
          AutoYTScrollerSettings: result,
        });
        if (result["shortCutKeys"])
          shortCutToggleKeys = [...result["shortCutKeys"]];
        if (result["shortCutInteractKeys"])
          shortCutInteractKeys = [...result["shortCutInteractKeys"]];
        if (result["scrollDirection"]) {
          if (result["scrollDirection"] === "up") scrollDirection = -1;
          else scrollDirection = 1;
        }
        if (result["amountOfPlaysToSkip"])
          amountOfPlaysToSkip = result["amountOfPlaysToSkip"];
        if (result["scrollOnComments"])
          scrollOnCommentsCheck = result["scrollOnComments"];
        if (result["filterByMinLength"])
          filterMinLength = result["filterByMinLength"];
        if (result["filterByMaxLength"])
          filterMaxLength = result["filterByMaxLength"];
        if (result["filterByMinViews"])
          filterMinViews = result["filterByMinViews"];
        if (result["filterByMaxViews"])
          filterMaxViews = result["filterByMaxViews"];
        if (result["filterByMinLikes"])
          filterMinLikes = result["filterByMinLikes"];
        if (result["filterByMaxLikes"])
          filterMaxLikes = result["filterByMaxLikes"];
        if (result["filterByMinComments"])
          filterMinComments = result["filterByMinComments"];
        if (result["filterByMaxComments"])
          filterMaxComments = result["filterByMaxComments"];
        if (result["filteredAuthors"])
          blockedCreators = [...result["filteredAuthors"]];
        if (result["filteredTags"]) blockedTags = [...result["filteredTags"]];
        if (result["whitelistedAuthors"])
          whitelistedCreators = [...result["whitelistedAuthors"]];
        if (result["whitelistSubscriptions"])
          whitelistSubscriptions = result["whitelistSubscriptions"];
        if (result["scrollOnNoTags"]) scrollOnNoTags = result["scrollOnNoTags"];
        if (result["additionalScrollDelay"])
          additionalScrollDelay = result["additionalScrollDelay"];

        shortCutListener();
      }
    );
    chrome.storage.onChanged.addListener(async (result) => {
      let newShortCutKeys = result["shortCutKeys"]?.newValue;
      if (newShortCutKeys != undefined) {
        shortCutToggleKeys = [...newShortCutKeys];
      }
      let newShortCutInteractKeys = result["shortCutInteractKeys"]?.newValue;
      if (newShortCutInteractKeys != undefined) {
        shortCutInteractKeys = [...newShortCutInteractKeys];
      }
      let newScrollDirection = result["scrollDirection"]?.newValue;
      if (newScrollDirection != undefined) {
        if (newScrollDirection === "up") scrollDirection = -1;
        else scrollDirection = 1;
      }
      let newAmountOfPlaysToSkip = result["amountOfPlaysToSkip"]?.newValue;
      if (newAmountOfPlaysToSkip) {
        amountOfPlaysToSkip = newAmountOfPlaysToSkip;
      }
      let newScrollOnComments = result["scrollOnComments"]?.newValue;
      if (newScrollOnComments !== undefined) {
        scrollOnCommentsCheck = newScrollOnComments;
      }
      let newFilterMinLength = result["filterByMinLength"]?.newValue;
      if (newFilterMinLength != undefined) {
        filterMinLength = newFilterMinLength;
      }
      let newFilterMaxLength = result["filterByMaxLength"]?.newValue;
      if (newFilterMaxLength != undefined) {
        filterMaxLength = newFilterMaxLength;
      }
      let newFilterMinViews = result["filterByMinViews"]?.newValue;
      if (newFilterMinViews != undefined) {
        filterMinViews = newFilterMinViews;
      }
      let newFilterMaxViews = result["filterByMaxViews"]?.newValue;
      if (newFilterMaxViews != undefined) {
        filterMaxViews = newFilterMaxViews;
      }
      let newFilterMinLikes = result["filterByMinLikes"]?.newValue;
      if (newFilterMinLikes != undefined) {
        filterMinLikes = newFilterMinLikes;
      }
      let newFilterMaxLikes = result["filterByMaxLikes"]?.newValue;
      if (newFilterMaxLikes != undefined) {
        filterMaxLikes = newFilterMaxLikes;
      }
      let newFilterMinComments = result["filterByMinComments"]?.newValue;
      if (newFilterMinComments != undefined) {
        filterMinComments = newFilterMinComments;
      }
      let newFilterMaxComments = result["filterByMaxComments"]?.newValue;
      if (newFilterMaxComments != undefined) {
        filterMaxComments = newFilterMaxComments;
      }
      let newBlockedCreators = result["filteredAuthors"]?.newValue;
      if (newBlockedCreators != undefined) {
        blockedCreators = [...newBlockedCreators];
      }
      let newBlockedTags = result["filteredTags"]?.newValue;
      if (newBlockedTags != undefined) {
        blockedTags = [...result["filteredTags"]?.newValue];
      }
      let newWhiteListedCreators = result["whitelistedAuthors"]?.newValue;
      if (newWhiteListedCreators != undefined) {
        whitelistedCreators = [...newWhiteListedCreators];
      }
      let newWhitelistSubscriptions =
        result["whitelistSubscriptions"]?.newValue;
      if (newWhitelistSubscriptions !== undefined) {
        whitelistSubscriptions = newWhitelistSubscriptions;
      }
      let newScrollOnNoTags = result["scrollOnNoTags"]?.newValue;
      if (newScrollOnNoTags !== undefined) {
        scrollOnNoTags = newScrollOnNoTags;
      }
      let newAdditionalScrollDelay = result["additionalScrollDelay"]?.newValue;
      if (newAdditionalScrollDelay !== undefined) {
        additionalScrollDelay = newAdditionalScrollDelay;
      }
      if (!(await checkShortValidity(findShortContainer(currentShortId)))) {
        scrollToNextShort(currentShortId);
      }
    });
  })();
})();

function shortCutListener() {
  let pressedKeys = [];
  // Web Dev Simplifed Debounce
  function debounce(cb: Function, delay: number) {
    let timeout: number;

    return (...args: any) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        cb(...args);
      }, delay);
    };
  }

  const checkKeys = (
    keysToCheck: string[],
    waitDebounce: boolean = true,
    delay: number = 700
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      function debounceCB() {
        if (pressedKeys.length == keysToCheck.length) {
          let match = true;
          for (let i = 0; i < pressedKeys.length; i++) {
            if (pressedKeys[i] != keysToCheck[i]) {
              match = false;
              break;
            }
          }
          resolve(match);
        } else resolve(false);
      }
      if (waitDebounce) debounce(debounceCB, delay)();
      else debounceCB();
    });
  };

  document.addEventListener("keydown", async (e) => {
    if (!e.key) return;
    pressedKeys.push(e.key.toLowerCase());
    // Shortcut for toggle application on/off
    if (await checkKeys(shortCutToggleKeys)) {
      if (applicationIsOn) {
        stopAutoScrolling();
        chrome.storage.local.set({
          applicationIsOn: false,
        });
      } else {
        startAutoScrolling();
        chrome.storage.local.set({
          applicationIsOn: true,
        });
      }
    } else if (await checkKeys(shortCutInteractKeys, false)) {
      // Shortcut for like/dislike
      const currentShort = findShortContainer();
      const likeBtn = currentShort.querySelector(
        LIKE_BUTTON_SELECTOR
      ) as HTMLButtonElement;
      const dislikeBtn = currentShort.querySelector(
        DISLIKE_BUTTON_SELECTOR
      ) as HTMLButtonElement;

      if (
        likeBtn?.getAttribute("aria-pressed") === "true" ||
        dislikeBtn?.getAttribute("aria-pressed") === "true"
      ) {
        dislikeBtn.click();
      } else {
        likeBtn.click();
      }
    }
    pressedKeys = [];
  });
}

function isShortsPage() {
  let containsShortElements = false;

  const doesPageHaveAShort = document.querySelector(
    VIDEOS_LIST_SELECTORS.join(",")
  ) as HTMLDivElement;
  if (doesPageHaveAShort) containsShortElements = true;

  return containsShortElements;
}

function parseTextToNumber(text: string): number {
  text = text.trim().toLowerCase();

  if (text.endsWith("k")) {
    return parseFloat(text) * 1_000;
  }
  if (text.endsWith("m")) {
    return parseFloat(text) * 1_000_000;
  }
  if (text.endsWith("b")) {
    return parseFloat(text) * 1_000_000_000;
  }

  return parseInt(text.replace(/,/g, "")) || 0; // Handle normal numbers like "933"
}

let lastCommentsVisibilityState = "";

const logCommentsVisibility = (
  visibilityAttr1OfComments: string | undefined,
  isInView: boolean,
  hasPanelContentVisible: boolean
) => {
  const state = JSON.stringify({
    visibilityAttr1OfComments,
    isInView,
    hasPanelContentVisible,
  });

  // Don't log if nothing changed
  if (state === lastCommentsVisibilityState) return;

  lastCommentsVisibilityState = state;

  console.log("[Auto Youtube Shorts Scroller] Comments visibility check:", {
    visibilityAttr1OfComments,
    isInView,
    hasPanelContentVisible,
  });
};
