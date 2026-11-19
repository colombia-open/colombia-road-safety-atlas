// Patrón gráfica fija + pasos de texto. Ver
// .claude/skills/data-scrollytelling/SKILL.md — cero scroll-jacking,
// IntersectionObserver con una franja angosta en el centro del
// viewport decide el paso activo.
function initScrolly(sectionEl, onStepChange) {
  const steps = [...sectionEl.querySelectorAll(".step")];
  const progressFill = sectionEl.querySelector(".scrolly-progress-fill");

  function setProgress(index) {
    if (!progressFill) return;
    const pct = steps.length <= 1 ? 100 : (index / (steps.length - 1)) * 100;
    progressFill.style.height = pct + "%";
  }

  if (!("IntersectionObserver" in window)) {
    // Sin soporte: estado final directo, nunca una página en blanco.
    onStepChange(steps.length - 1);
    setProgress(steps.length - 1);
    steps.forEach((s) => s.classList.add("is-active"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const index = Number(entry.target.dataset.step);
          steps.forEach((s) => s.classList.toggle("is-active", s === entry.target));
          onStepChange(index);
          setProgress(index);
        }
      }
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );

  steps.forEach((s) => observer.observe(s));
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Reveal simple (fade+slide) para secciones que no son sticky+pasos
// (donde/tiempo) — un solo disparo, nunca deja contenido en opacity:0
// sin IntersectionObserver.
function initRevealObserver() {
  const targets = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 }
  );
  targets.forEach((el) => observer.observe(el));
}
