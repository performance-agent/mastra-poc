export function registerCuteIcon() {
  if (typeof window === "undefined" || customElements.get("cute-icon")) return;

  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display: inline-block; width: var(--cute-size, 220px); max-width: 100%; aspect-ratio: 1; vertical-align: middle; }
      svg { display: block; width: 100%; height: auto; overflow: visible; }
      .float, .react { transform-origin: 80px 80px; }
      .float { animation: cute-idle-float 4.8s ease-in-out infinite; }
      .react { transition: transform 320ms cubic-bezier(.2,.8,.2,1); }
      .look { animation: cute-idle-look 7s ease-in-out infinite; }
      .blink { transform-origin: 80px 82px; animation: cute-blink 6.4s ease-in-out infinite; }
      .eye-left { transform-origin: 62px 82px; }
      .eye-right { transform-origin: 96px 82px; }
      .eye-left, .eye-right { transition: transform 280ms ease; }

      svg[data-state="hover"] .react { transform: translateY(-2px) scale(1.045) rotate(var(--cute-tilt, -2deg)); }
      svg[data-state="hover"] .look { animation: none; transform: translate(var(--cute-eye-x, 4px), var(--cute-eye-y, -2px)); transition: transform 140ms ease-out; }
      svg[data-state="hover"] .eye-left, svg[data-state="hover"] .eye-right { transform: scale(1.08, .9); }

      svg[data-state="thinking"] .float { animation: cute-think-rock 3.2s ease-in-out infinite; }
      svg[data-state="thinking"] .look { animation: cute-think-look 3.6s ease-in-out infinite; }
      svg[data-state="thinking"] .eye-left { transform: scaleY(.78); }
      svg[data-state="thinking"] .eye-right { transform: scaleY(.94); }

      svg[data-state="generating"] .float { animation: cute-generate-float 2.2s ease-in-out infinite; }
      svg[data-state="generating"] .look { animation: none; transform: translateY(-1px); }
      svg[data-state="generating"] .blink { animation: none; }
      svg[data-state="generating"] .eye-left { animation: cute-generate-eye 1.1s ease-in-out infinite; }
      svg[data-state="generating"] .eye-right { animation: cute-generate-eye 1.1s ease-in-out .18s infinite; }

      @keyframes cute-idle-float {
        0%, 100% { transform: translateY(1px) rotate(-1deg); }
        50% { transform: translateY(-3px) rotate(1deg); }
      }
      @keyframes cute-idle-look {
        0%, 12%, 100% { transform: translate(0, 0); }
        25%, 40% { transform: translate(3px, -1px); }
        60%, 75% { transform: translate(-3px, 1px); }
        90% { transform: translate(0, 0); }
      }
      @keyframes cute-blink {
        0%, 42%, 47%, 81%, 86%, 100% { transform: scaleY(1); }
        44.5%, 83.5% { transform: scaleY(.07); }
      }
      @keyframes cute-think-rock {
        0%, 100% { transform: translateY(-1px) rotate(-3deg); }
        50% { transform: translateY(-4px) rotate(3deg); }
      }
      @keyframes cute-think-look {
        0%, 15%, 100% { transform: translate(-3px, -6px); }
        45%, 65% { transform: translate(3px, -6px); }
      }
      @keyframes cute-generate-float {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-2px) scale(1.015); }
      }
      @keyframes cute-generate-eye {
        0%, 100% { transform: scale(.96, .76); }
        50% { transform: scale(1.02, 1.1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .float, .react, .look, .blink, .eye-left, .eye-right { animation: none !important; transition: none !important; }
        svg[data-state="hover"] .react, svg[data-state="hover"] .look { transform: none; }
        svg[data-state="generating"] .eye-left, svg[data-state="generating"] .eye-right { transform: scaleY(.85); }
      }
    </style>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none" data-state="idle" role="img" aria-labelledby="cute-title cute-desc">
      <title id="cute-title">Rombito violeta</title>
      <desc id="cute-desc">Ojos blancos que miran a los lados y parpadean.</desc>
      <g class="float"><g class="react">
        <path class="body" fill="var(--cute-color, var(--cute-default-color, #9254FF))" d="M80 15C93 15 145 64 145 80C145 97 96 145 80 145C63 145 15 97 15 80C15 63 64 15 80 15Z"/>
        <g class="look"><g class="blink" fill="#FFF">
          <g class="eye-left"><ellipse cx="62" cy="82" rx="12" ry="14"/></g>
          <g class="eye-right"><ellipse cx="96" cy="82" rx="12" ry="14"/></g>
        </g></g>
      </g></g>
    </svg>`;

  const variants = {
    diamond: {
      title: "Rombito violeta",
      color: "#9254FF",
      path: "M80 15C93 15 145 64 145 80C145 97 96 145 80 145C63 145 15 97 15 80C15 63 64 15 80 15Z",
    },
    circle: {
      title: "Redondito naranja",
      color: "#FF7A21",
      path: "M80 17C114.8 17 143 45.2 143 80C143 114.8 114.8 143 80 143C45.2 143 17 114.8 17 80C17 45.2 45.2 17 80 17Z",
    },
    square: {
      title: "Cuadradito turquesa",
      color: "#00B8A6",
      path: "M52 22H108C129 22 139 33 139 54V106C139 127 128 138 107 138H53C31 138 21 127 21 106V54C21 32 32 22 52 22Z",
    },
    triangle: {
      title: "Gotita rosa",
      color: "#FA3F94",
      path: "M66 26C72 15 88 15 95 26L142 108C153 127 142 141 121 143C93 147 67 147 39 143C18 141 7 127 18 108Z",
    },
    cloud: {
      title: "Nubecita azul",
      color: "#2082FF",
      path: "M40 54C40 30 57 20 76 25C93 13 121 25 121 47C143 51 150 70 140 88C158 107 144 135 120 133C106 150 80 149 68 133C46 143 23 133 23 112C6 102 9 76 27 69C27 59 32 54 40 54Z",
    },
  };
  const states = ["idle", "hover", "thinking", "generating"];
  const descriptions = {
    idle: "Flota suavemente, mira a los lados y parpadea.",
    hover: "Se acerca y sus ojos blancos siguen al cursor.",
    thinking: "Se balancea y mira hacia arriba mientras piensa.",
    generating: "Sus ojos blancos pulsan alternadamente mientras genera una respuesta.",
  };

  class CuteIcon extends HTMLElement {
    static get observedAttributes() {
      return ["state", "variant"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
      this._svg = this.shadowRoot.querySelector("svg");
      this._description = this.shadowRoot.querySelector("desc");
      this._body = this.shadowRoot.querySelector(".body");
      this._title = this.shadowRoot.querySelector("title");
      this._inside = false;

      this.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "touch") return;
        this._inside = true;
        this._point(event);
        this._refresh();
      });
      this.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "touch" && this._inside) this._point(event);
      });
      this.addEventListener("pointerleave", () => {
        this._inside = false;
        ["--cute-eye-x", "--cute-eye-y", "--cute-tilt"].forEach((name) =>
          this._svg.style.removeProperty(name),
        );
        this._refresh();
      });
    }

    connectedCallback() {
      this._refreshVariant();
      this._refresh();
    }
    attributeChangedCallback(name) {
      if (name === "variant") this._refreshVariant();
      else this._refresh();
    }

    get state() {
      const value = this.getAttribute("state");
      return states.includes(value) ? value : "idle";
    }
    set state(value) {
      this.setAttribute("state", value);
    }

    get variant() {
      const value = this.getAttribute("variant");
      return Object.prototype.hasOwnProperty.call(variants, value) ? value : "diamond";
    }
    set variant(value) {
      this.setAttribute("variant", value);
    }

    _refreshVariant() {
      const variant = variants[this.variant];
      this._body.setAttribute("d", variant.path);
      this._svg.style.setProperty("--cute-default-color", variant.color);
      this._title.textContent = variant.title;
    }

    _point(event) {
      const bounds = this.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1));
      this._svg.style.setProperty("--cute-eye-x", `${(x * 6).toFixed(2)}px`);
      this._svg.style.setProperty("--cute-eye-y", `${(y * 4).toFixed(2)}px`);
      this._svg.style.setProperty("--cute-tilt", `${(x * 3).toFixed(2)}deg`);
    }

    _refresh() {
      const effective = this.state === "idle" && this._inside ? "hover" : this.state;
      const changed = this._svg.dataset.state !== effective;
      this._svg.dataset.state = effective;
      this._description.textContent = descriptions[effective];
      if (changed)
        this.dispatchEvent(
          new CustomEvent("cute-statechange", {
            detail: { state: effective },
            bubbles: true,
            composed: true,
          }),
        );
    }
  }

  customElements.define("cute-icon", CuteIcon);
}
