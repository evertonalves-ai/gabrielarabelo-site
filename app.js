(() => {
  "use strict";

  // Chave publicável: só permite INSERT na tabela leads (RLS + grants por coluna).
  const SUPABASE_URL = "https://uvpnwovvhmkvttdivmfp.supabase.co";
  const SUPABASE_KEY = "sb_publishable_YzPaf__gl-4jV-GrxkxJZQ_yDE4czVD";
  const TABELA = "leads";

  // Quando tiver o número da Gabriela (só dígitos, com DDI: 5534999999999),
  // preencha aqui e o WhatsApp abre com a mensagem já escrita.
  const WHATSAPP_NUMERO = "";
  const WHATSAPP_LINK = "https://whats.link/gabrielarabelobeauty1";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const temGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  $("#ano").textContent = new Date().getFullYear();

  /* ---------------- Rolagem suave (Lenis) ---------------- */
  let lenis = null;
  if (!reduzir && typeof window.Lenis !== "undefined") {
    lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    if (temGsap) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  function irPara(alvo) {
    const el = typeof alvo === "string" ? $(alvo) : alvo;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -70 });
    else el.scrollIntoView({ behavior: reduzir ? "auto" : "smooth" });
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener("click", e => {
    const id = a.getAttribute("href");
    if (id.length < 2 || !$(id)) return;
    e.preventDefault();
    irPara(id);
  }));

  /* ---------------- Menu mobile ---------------- */
  const toggle = $("#menuToggle");
  const menu = $("#menu");
  toggle.addEventListener("click", () => {
    const aberto = menu.classList.toggle("aberto");
    toggle.setAttribute("aria-expanded", String(aberto));
  });
  $$("#menu a").forEach(a => a.addEventListener("click", () => {
    menu.classList.remove("aberto");
    toggle.setAttribute("aria-expanded", "false");
  }));

  /* ---------------- Topo: encolhe e se esconde ao rolar ---------------- */
  const topo = $("#topo");
  let ultimoY = 0;
  function aoRolar() {
    const y = window.scrollY;
    topo.classList.toggle("rolado", y > 40);
    topo.classList.toggle("escondido", y > 500 && y > ultimoY && !menu.classList.contains("aberto"));
    ultimoY = y;
  }
  window.addEventListener("scroll", aoRolar, { passive: true });
  aoRolar();

  /* ---------------- Utilitários de texto ---------------- */
  function dividirPalavras(el, classe) {
    const palavras = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", el.textContent.trim());
    el.innerHTML = "";
    palavras.forEach((p, i) => {
      const fora = document.createElement("span");
      fora.className = classe;
      fora.setAttribute("aria-hidden", "true");
      if (classe === "palavra") {
        const dentro = document.createElement("span");
        dentro.textContent = p;
        fora.appendChild(dentro);
      } else {
        fora.textContent = p;
      }
      el.appendChild(fora);
      if (i < palavras.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }

  /* ---------------- Preloader + animações ---------------- */
  const preloader = $("#preloader");
  function liberar() {
    document.body.classList.remove("carregando");
    if (lenis) lenis.start();
  }

  if (!temGsap || reduzir) {
    preloader.remove();
    liberar();
  } else {
    if (lenis) lenis.stop();
    gsap.registerPlugin(ScrollTrigger);
    window.scrollTo(0, 0);

    // Prepara textos
    $$(".titulo-split").forEach(el => dividirPalavras(el, "palavra"));
    dividirPalavras($("#citacao"), "w");

    // Estado inicial do hero
    gsap.set(".hero__titulo .linha > span", { yPercent: 110 });
    gsap.set(".hero__anim", { y: 30, opacity: 0 });
    gsap.set(".hero__arco", { clipPath: "inset(100% 0% 0% 0% round 999px 999px 20px 20px)" });
    gsap.set(".hero__logo", { scale: 1.25, opacity: 0 });
    gsap.set([".hero__selo", ".hero__anel"], { opacity: 0, scale: .8 });
    gsap.set(".topo", { yPercent: -100 });

    const linhaP = $(".preloader__linha");
    const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
    intro
      .to(".preloader__mono text", { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut", stagger: .15 })
      .to(linhaP, { "--p": 1, duration: 1.6, ease: "power2.inOut" }, 0)
      .to(".preloader__mono text", { fill: "#d9c09a", strokeWidth: 0, duration: .5 }, "-=.3")
      .to(preloader, { yPercent: -100, duration: 1.1, ease: "expo.inOut", onComplete: () => { preloader.remove(); liberar(); } }, "+=.15")
      .to(".topo", { yPercent: 0, duration: 1 }, "-=.45")
      .to(".hero__titulo .linha > span", { yPercent: 0, duration: 1.3, stagger: .12 }, "<")
      .to(".hero__arco", { clipPath: "inset(0% 0% 0% 0% round 999px 999px 20px 20px)", duration: 1.5, ease: "expo.inOut" }, "<")
      .to(".hero__logo", { scale: 1, opacity: 1, duration: 1.4 }, "-=.9")
      .to(".hero__anim", { y: 0, opacity: 1, duration: 1, stagger: .1 }, "-=1.2")
      .to([".hero__selo", ".hero__anel"], { opacity: 1, scale: 1, duration: 1, ease: "back.out(1.6)", stagger: .1 }, "-=.9");

    // Barra de progresso
    gsap.to("#progresso", { scaleX: 1, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: .3 } });

    // Títulos palavra por palavra
    $$(".titulo-split").forEach(el => {
      gsap.fromTo($$(".palavra > span", el), { y: 0, yPercent: 110 }, {
        y: 0, yPercent: 0, duration: 1.1, ease: "expo.out", stagger: .06, clearProps: "transform",
        scrollTrigger: { trigger: el, start: "top 85%" }
      });
    });

    // Elementos que sobem
    gsap.set(".sobe", { y: 40, opacity: 0 });
    ScrollTrigger.batch(".sobe", {
      start: "top 88%",
      onEnter: lote => gsap.to(lote, { y: 0, opacity: 1, duration: 1, ease: "expo.out", stagger: .08, overwrite: true }),
      once: true
    });

    // Cards: entram em perspectiva e a imagem se revela
    gsap.from(".card", {
      y: 90, rotateX: 14, opacity: 0, duration: 1.3, ease: "expo.out", stagger: .12,
      scrollTrigger: { trigger: ".cards", start: "top 82%" }
    });
    $$(".card__img").forEach(img => {
      gsap.from(img, {
        clipPath: "inset(100% 0% 0% 0% round 14px)", duration: 1.4, ease: "expo.inOut",
        scrollTrigger: { trigger: img, start: "top 88%" }
      });
    });

    // Citação acende palavra por palavra conforme rola
    gsap.to("#citacao .w", {
      opacity: 1, stagger: .05, ease: "none",
      scrollTrigger: { trigger: ".citacao", start: "top 75%", end: "bottom 60%", scrub: true }
    });

    // Foto do "Sobre": cortina + parallax
    gsap.from(".sobre__foto", {
      clipPath: "inset(0% 0% 100% 0% round 20px)", duration: 1.6, ease: "expo.inOut",
      scrollTrigger: { trigger: ".sobre__foto", start: "top 80%" }
    });
    $$("[data-parallax]").forEach(el => {
      const v = parseFloat(el.dataset.parallax);
      gsap.to(el, {
        y: () => v * window.innerHeight, ease: "none",
        scrollTrigger: { trigger: el.closest("section"), start: "top bottom", end: "bottom top", scrub: true }
      });
    });

    // Passos: a linha se desenha e acende cada etapa
    const passos = $$(".passos li");
    gsap.to("#trilha", {
      strokeDashoffset: 0, ease: "none",
      scrollTrigger: {
        trigger: ".passos-wrap", start: "top 70%", end: "bottom 55%", scrub: true,
        onUpdate: st => passos.forEach((li, i) => li.classList.toggle("ativo", st.progress >= i / (passos.length - 1) - .02))
      }
    });
    gsap.from(passos, {
      y: 50, opacity: 0, duration: 1, ease: "expo.out", stagger: .15,
      scrollTrigger: { trigger: ".passos", start: "top 80%" }
    });

    // Formulário e brilho de fundo
    gsap.from(".form", {
      y: 80, opacity: 0, duration: 1.3, ease: "expo.out",
      scrollTrigger: { trigger: ".agendar", start: "top 75%" }
    });
    gsap.to(".agendar__brilho", {
      x: 500, y: 300, ease: "none",
      scrollTrigger: { trigger: "#agendar", start: "top bottom", end: "bottom top", scrub: true }
    });

    // Nome gigante no rodapé desliza
    gsap.fromTo(".rodape__gigante", { xPercent: -12 }, {
      xPercent: 0, ease: "none",
      scrollTrigger: { trigger: ".rodape", start: "top bottom", end: "bottom bottom", scrub: true }
    });

    // Faixa acelera e inclina com a velocidade da rolagem
    if (lenis) {
      const trilho = $(".faixa__trilho");
      const inclinar = gsap.quickTo(trilho, "skewX", { duration: .5, ease: "power3" });
      lenis.on("scroll", ({ velocity }) => inclinar(gsap.utils.clamp(-8, 8, velocity * -.4)));
    }

    // Recalcula depois que as fontes carregam
    document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ---------------- Interações de desktop ---------------- */
  if (desktop && !reduzir && temGsap) {
    // Cursor
    const cursor = $("#cursor");
    const cx = gsap.quickTo(cursor, "x", { duration: .45, ease: "power3" });
    const cy = gsap.quickTo(cursor, "y", { duration: .45, ease: "power3" });
    window.addEventListener("mousemove", e => { cursor.classList.add("ativo"); cx(e.clientX); cy(e.clientY); });
    document.addEventListener("mouseleave", () => cursor.classList.remove("ativo"));
    $$("[data-cursor]").forEach(el => {
      el.addEventListener("mouseenter", () => cursor.classList.add("grande"));
      el.addEventListener("mouseleave", () => cursor.classList.remove("grande"));
    });
    $$("a, button, summary, .chips label").forEach(el => {
      el.addEventListener("mouseenter", () => cursor.classList.remove("grande"));
      el.addEventListener("mouseleave", () => { if (el.closest("[data-cursor]")) cursor.classList.add("grande"); });
    });

    // Botões magnéticos
    $$(".magnetico").forEach(btn => {
      const mx = gsap.quickTo(btn, "x", { duration: .6, ease: "elastic.out(1, .4)" });
      const my = gsap.quickTo(btn, "y", { duration: .6, ease: "elastic.out(1, .4)" });
      btn.addEventListener("mousemove", e => {
        const r = btn.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * .3);
        my((e.clientY - r.top - r.height / 2) * .4);
      });
      btn.addEventListener("mouseleave", () => { mx(0); my(0); });
    });

    // Cards inclinam e o brilho segue o mouse
    $$(".card").forEach(card => {
      const rx = gsap.quickTo(card, "rotateX", { duration: .6, ease: "power3" });
      const ry = gsap.quickTo(card, "rotateY", { duration: .6, ease: "power3" });
      const img = $(".card__img", card);
      card.addEventListener("mousemove", e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        rx(py * -8); ry(px * 8);
        const ri = img.getBoundingClientRect();
        img.style.setProperty("--mx", `${e.clientX - ri.left}px`);
        img.style.setProperty("--my", `${e.clientY - ri.top}px`);
      });
      card.addEventListener("mouseleave", () => { rx(0); ry(0); });
    });
  }

  /* ---------------- Acordeão com altura animada ---------------- */
  $$(".acordeao details").forEach(det => {
    const sum = $("summary", det);
    const corpo = $(".acordeao__corpo", det);
    sum.addEventListener("click", e => {
      if (!temGsap || reduzir) return;
      e.preventDefault();
      if (det.open) {
        gsap.to(corpo, { height: 0, duration: .5, ease: "expo.inOut", onComplete: () => { det.open = false; corpo.style.height = ""; } });
      } else {
        det.open = true;
        gsap.from(corpo, { height: 0, duration: .7, ease: "expo.out", clearProps: "height" });
      }
    });
  });

  /* ---------------- "Saiba mais" ---------------- */
  const detalhes = {
    corporal: {
      titulo: "Harmonização corporal com placas",
      corpo: `<p>Protocolo de estética corporal para trabalhar o contorno e a definição de regiões como abdômen, flancos, culote, glúteos e braços.</p>
        <ul><li>Indicado para quem quer melhorar o contorno corporal</li><li>Número de sessões definido na avaliação</li><li>Pode ser combinado com ativação de colágeno</li></ul>`,
      proc: "Harmonização corporal com placas"
    },
    facial: {
      titulo: "Harmonização facial com placas",
      corpo: `<p>Cuidado com o contorno do rosto, região da papada e sustentação da pele, respeitando os traços de cada pessoa.</p>
        <ul><li>Resultado natural, sem mudar quem você é</li><li>Protocolo montado depois da avaliação</li></ul>`,
      proc: "Harmonização facial com placas"
    },
    colageno: {
      titulo: "Ativação de colágeno",
      corpo: `<p>Com o tempo o corpo produz menos colágeno, e a pele perde firmeza. Os protocolos de ativação estimulam essa produção para melhorar textura, firmeza e flacidez.</p>
        <ul><li>Pode ser feito no rosto e no corpo</li><li>Resultado progressivo, ao longo das sessões</li></ul>`,
      proc: "Ativação de colágeno"
    },
    avaliacao: {
      titulo: "Avaliação facial e corporal",
      corpo: `<p>É o primeiro passo de qualquer tratamento. Conversamos sobre o que te incomoda, eu avalio a área e explico quais protocolos fazem sentido, quantas sessões e quanto custa.</p>
        <p>Você sai com um plano claro e decide com calma.</p>`,
      proc: "Avaliação (ainda não sei)"
    }
  };
  const modal = $("#modal");
  let procModal = "";
  $$("[data-saiba]").forEach(btn => btn.addEventListener("click", () => {
    const d = detalhes[btn.dataset.saiba];
    $("#modalTitulo").textContent = d.titulo;
    $("#modalCorpo").innerHTML = d.corpo; // conteúdo estático, definido acima
    procModal = d.proc;
    modal.showModal();
    if (lenis) lenis.stop();
  }));
  modal.addEventListener("close", () => { if (lenis) lenis.start(); });
  $("#modalFechar").addEventListener("click", () => modal.close());
  modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });
  $("#modalCta").addEventListener("click", () => { modal.close(); escolherProcedimento(procModal); });

  /* ---------------- Formulário ---------------- */
  const form = $("#formLead");
  const status = $("#formStatus");
  const btn = $("#btnEnviar");
  const tel = $("#whatsapp");

  function escolherProcedimento(nome) {
    const radio = $$('input[name="procedimento"]', form).find(r => r.value === nome);
    if (radio) radio.checked = true;
    setTimeout(() => $("#nome").focus({ preventScroll: true }), 1200);
  }
  $$("[data-proc]").forEach(a => a.addEventListener("click", () => escolherProcedimento(a.dataset.proc)));

  tel.addEventListener("input", () => {
    const d = tel.value.replace(/\D/g, "").slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    tel.value = v;
  });

  function marcarErro(campo, msg) {
    $(`[data-erro="${campo}"]`).textContent = msg || "";
    const input = form.elements[campo];
    if (input && input.type && input.type !== "checkbox") input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  function validar(dados) {
    let ok = true;
    const nome = dados.nome.trim();
    if (nome.length < 2 || nome.length > 80) { marcarErro("nome", "Digite seu nome."); ok = false; } else marcarErro("nome");
    if (!/^\d{10,11}$/.test(dados.whatsapp)) { marcarErro("whatsapp", "Digite um WhatsApp com DDD."); ok = false; } else marcarErro("whatsapp");
    if (!dados.procedimento) { marcarErro("procedimento", "Escolha uma opção."); ok = false; } else marcarErro("procedimento");
    if (!dados.consentimento) { marcarErro("consentimento", "Preciso da sua autorização para entrar em contato."); ok = false; } else marcarErro("consentimento");
    return ok;
  }

  function linkWhatsApp(msg) {
    return WHATSAPP_NUMERO
      ? `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`
      : WHATSAPP_LINK;
  }

  async function salvarLead(dados) {
    const params = new URLSearchParams(location.search);
    const origem = (params.get("utm_source") || document.referrer || "direto").slice(0, 120);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABELA}`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({
        nome: dados.nome.trim(),
        whatsapp: "55" + dados.whatsapp,
        procedimento: dados.procedimento,
        origem,
        consentimento: true
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (form.elements.empresa.value) return; // bot

    const marcado = $('input[name="procedimento"]:checked', form);
    const dados = {
      nome: form.elements.nome.value,
      whatsapp: tel.value.replace(/\D/g, ""),
      procedimento: marcado ? marcado.value : "",
      consentimento: form.elements.consentimento.checked
    };
    if (!validar(dados)) {
      status.className = "form__status falha";
      status.textContent = "Confira os campos destacados.";
      if (temGsap && !reduzir) gsap.fromTo(form, { x: -8 }, { x: 0, duration: .6, ease: "elastic.out(1, .3)" });
      return;
    }

    btn.disabled = true;
    $("span", btn).textContent = "Enviando…";
    status.className = "form__status";
    status.textContent = "";

    const msg = `Olá, Gabriela! Sou ${dados.nome.trim()} e tenho interesse em: ${dados.procedimento}. Gostaria de agendar uma avaliação.`;
    let salvo = true;
    try { await salvarLead(dados); } catch { salvo = false; }

    // Mesmo se o banco falhar, o contato segue pelo WhatsApp
    if (!WHATSAPP_NUMERO && navigator.clipboard) {
      try { await navigator.clipboard.writeText(msg); } catch { /* sem permissão: segue */ }
    }
    const link = linkWhatsApp(msg);
    $("#formOkLink").href = link;
    $("#formOk h3").textContent = salvo ? "Recebi seu contato!" : "Quase lá!";
    $("#formOkTexto").textContent = salvo
      ? (WHATSAPP_NUMERO ? "Abrindo o WhatsApp para a gente continuar…" : "Abrindo o WhatsApp. Sua mensagem já foi copiada, é só colar e enviar.")
      : "Não consegui registrar agora, mas você pode falar direto comigo pelo WhatsApp.";
    $("#formOk").hidden = false;

    form.reset();
    btn.disabled = false;
    $("span", btn).textContent = "Quero ser chamada no WhatsApp";
    if (salvo) setTimeout(() => { window.location.href = link; }, 2200);
  });
})();
