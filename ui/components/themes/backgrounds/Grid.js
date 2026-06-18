const { html } = globalThis;
const { Component } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Cuadrícula CRT retro con scanlines animadas.
export class Grid extends Component {
  constructor(props) {
    super(props);
    this.accent = createAccentWatcher('#06b6d4');
    this.state = { rgb: [6, 182, 212] };
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
    const lineColor = `rgba(${r},${g},${b},0.06)`;
    return html`
      <div
        class="fixed inset-0 pointer-events-none"
        style=${'z-index:-1;background-image:linear-gradient(' + lineColor + ' 1px,transparent 1px),linear-gradient(90deg,' + lineColor + ' 1px,transparent 1px);background-size:40px 40px'}
      ></div>
      <div
        class="fixed inset-0 pointer-events-none"
        style="z-index:-1; background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.55) 100%)"
      ></div>
      <div
        class="fixed inset-0 pointer-events-none"
        style="z-index:-1;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.08) 2px,rgba(0,0,0,.08) 4px);animation:grid-scan 8s linear infinite"
      ></div>
    `;
  }
}
