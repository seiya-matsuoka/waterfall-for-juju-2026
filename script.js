(() => {
  const frame = document.getElementById("design-frame");
  const tabs = Array.from(document.querySelectorAll(".design-tab"));

  const designMap = {
    impreza: "./designs/impreza/index.html",
    lark: "./designs/lark/index.html",
  };

  const validDesigns = new Set(Object.keys(designMap));

  function readInitialDesign() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("design");
    return validDesigns.has(requested) ? requested : "impreza";
  }

  function setActiveDesign(design, { replaceHistory = false } = {}) {
    if (!validDesigns.has(design)) return;

    frame.src = designMap[design];

    tabs.forEach((tab) => {
      const isActive = tab.dataset.design === design;
      tab.classList.toggle("is-active", isActive);
      if (tab.dataset.design) {
        tab.setAttribute("aria-pressed", String(isActive));
      }
    });

    const url = new URL(window.location.href);
    url.searchParams.set("design", design);

    const method = replaceHistory ? "replaceState" : "pushState";
    window.history[method]({ design }, "", url);
  }

  tabs.forEach((tab) => {
    if (!tab.dataset.design || !designMap[tab.dataset.design]) return;

    tab.addEventListener("click", () => {
      const nextDesign = tab.dataset.design;
      const currentDesign = new URL(window.location.href).searchParams.get(
        "design",
      );

      if (!nextDesign || nextDesign === currentDesign) return;
      setActiveDesign(nextDesign);
    });
  });

  window.addEventListener("popstate", () => {
    setActiveDesign(readInitialDesign(), { replaceHistory: true });
  });

  setActiveDesign(readInitialDesign(), { replaceHistory: true });
})();
