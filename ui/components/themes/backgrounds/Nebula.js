const { Component } = globalThis.preact;
import { createAccentWatcher, fitCanvas} from '../lib.js';

// Nebulosa suave con estrellas titilantes.
export class Nebula extends Component {
  constructor(props) {
    super(props);
    this.accent = createAccentWatcher('#8b5cf6');
    this.state = { rgb: [139, 92, 246] };
    this.stars = Array.from({ length: 60 }, () => ({
      size:    Math.random() * 2.8 + 0.7,
      left:    Math.random() * 100,
      top:     Math.random() * 100,
      delay:   -Math.random() * 7,
      opacity: Math.random() * 0.4 + 0.15,
    }));
  }

  componentDidMount() {
    this.accent.start();
    this._interval = setInterval(() => {
      const rgb = this.accent.state?.rgb ?? this.accent.rgb;
      if (rgb) this.setState({ rgb });
    }, 500);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
    this.accent.stop();
  }

  render() {
    const html = globalThis.html;
    const [r, g, b] = this.state.rgb;
    const c1 = `rgba(${r},${Math.round(g*0.3)},${b},0.18)`;
    const c2 = `rgba(${b},${Math.round(r*0.4)},${g},0.12)`;
    const c3 = `rgba(${Math.round(r*0.55)},${Math.round(g*0.35)},${b},0.18)`;
    const c4 = `rgba(${b},${Math.round(r*0.4)},${g},0.12)`;
    const bg = `rgb(${Math.max(3,Math.round(r*0.04))},${Math.max(1,Math.round(g*0.02))},${Math.max(8,Math.round(b*0.055))})`;

    return html`
      <div
        class="fixed inset-0 pointer-events-none overflow-hidden"
        style=${'z-index:-1;background:radial-gradient(circle at 40% 30%,' + c1 + ' 0%,transparent 55%),radial-gradient(circle at 70% 65%,' + c2 + ' 0%,transparent 60%),' + bg}
      >
        <div class="absolute inset-0 pointer-events-none" style="filter:blur(60px);opacity:0.35">
          <div
            class="absolute inset-0 pointer-events-none"
            style=${'background:radial-gradient(ellipse 80% 60% at 30% 40%,' + c3 + ',transparent),radial-gradient(ellipse 70% 80% at 75% 55%,' + c4 + ',transparent);animation:nebula-drift 85s linear infinite'}
          ></div>
        </div>
      </div>
      <div class="fixed inset-0 pointer-events-none" style="z-index:-1; will-change:transform">
        ${this.stars.map((s, i) => html`
          <div
            key=${i}
            class="absolute rounded-full pointer-events-none"
            style=${'width:' + s.size + 'px;height:' + s.size + 'px;left:' + s.left + '%;top:' + s.top + '%;background:#fff;box-shadow:0 0 12px rgba(' + r + ',' + g + ',' + b + ',.6);animation:nebula-twinkle 6s ease-in-out infinite;animation-delay:' + s.delay + 's;opacity:' + s.opacity}
          ></div>
        `)}
      </div>
    `;
  }
}
