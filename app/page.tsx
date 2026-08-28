import { ArrowDown, ArrowUpRight, Asterisk, Sparkles } from 'lucide-react';

const projects = [
  {
    number: '01',
    title: 'PlaySpace',
    kind: 'Creative installation · 2026',
    description: 'A touch-first digital paper studio where visitors turn portraits, gestures, and words into one-of-one posters.',
    image: '/projects/playspace.png',
    href: 'https://invinixity.com/creators/louism/PlaySpace/',
    className: 'project--playspace',
  },
  {
    number: '02',
    title: 'Gnimrofarret',
    kind: 'Generative world · Ongoing',
    description: 'A camera-aware synthetic landscape that bends atmosphere, sound, and motion into a world of its own.',
    image: '/projects/gnimrofarret.jpg',
    href: 'https://invinixity.com/creators/louism/Gnimrofarret/',
    className: 'project--gnimrofarret',
  },
  {
    number: '03',
    title: 'Axelerometric',
    kind: 'Audiovisual instrument · 2024',
    description: 'A reactive browser instrument translating sound, movement, and live input into volatile visual matter.',
    image: '/projects/axelerometric.png',
    href: 'https://invinixity.com/creators/louism/Axelerometric/',
    className: 'project--axelerometric',
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Invinixity home">INV<span>∞</span>NIXITY</a>
        <nav aria-label="Primary navigation">
          <a href="#work">Selected work</a>
          <a href="#studio">Studio</a>
        </nav>
        <a className="availability" href="#studio"><i /> Jakarta, ID</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-orbit" aria-hidden="true"><span>∞</span></div>
        <p className="eyebrow"><Asterisk size={14} /> Independent experimental studio · Est. somewhere between now &amp; next</p>
        <h1>
          <span>We make the</span>
          <span className="hero-line-accent">future feel</span>
          <span>strangely human.</span>
        </h1>
        <div className="hero-footer">
          <p>Invinixity creates interactive installations, digital worlds, and playful systems for curious humans.</p>
          <a className="round-link" href="#work" aria-label="Explore selected work"><ArrowDown size={24} /></a>
        </div>
      </section>

      <div className="ticker" aria-label="Invinixity disciplines">
        <div>
          <span>ART &amp; TECHNOLOGY</span><Sparkles size={22} />
          <span>PLAYFUL SYSTEMS</span><Sparkles size={22} />
          <span>DIGITAL WORLDS</span><Sparkles size={22} />
          <span>ART &amp; TECHNOLOGY</span><Sparkles size={22} />
          <span>PLAYFUL SYSTEMS</span><Sparkles size={22} />
          <span>DIGITAL WORLDS</span><Sparkles size={22} />
        </div>
      </div>

      <section className="work-section" id="work">
        <div className="section-heading">
          <p className="eyebrow"><Asterisk size={14} /> Selected experiments</p>
          <p className="section-index">( 03 )</p>
        </div>
        <div className="projects">
          {projects.map((project) => (
            <article className={`project ${project.className}`} key={project.title}>
              <a href={project.href} aria-label={`Open ${project.title}`}>
                <div className="project-image-wrap">
                  <img src={project.image} alt="" className="project-image" />
                  <span className="project-open"><ArrowUpRight size={24} /></span>
                  <span className="project-number">{project.number}</span>
                </div>
                <div className="project-copy">
                  <div>
                    <p>{project.kind}</p>
                    <h2>{project.title}</h2>
                  </div>
                  <p className="project-description">{project.description}</p>
                </div>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="studio-section" id="studio">
        <div className="studio-kicker">
          <span className="pulse" />
          <span>Currently transmitting from Jakarta</span>
        </div>
        <p className="studio-statement">We work where bodies meet browsers, where theatre meets code, and where a weird idea becomes a world you can step inside.</p>
        <div className="studio-bottom">
          <p>Creative technology<br />Interactive installations<br />Generative experiences<br />Performance systems</p>
          <a className="infinity-mark" href="#top" aria-label="Back to top">∞</a>
          <p className="studio-note">Small studio.<br />Infinite rabbit holes.<br />Always curious.</p>
        </div>
      </section>

      <footer>
        <a className="footer-wordmark" href="#top">INV∞NIXITY</a>
        <div><span>Independent since 2024</span><span>Jakarta · Indonesia</span><span>© 2026</span></div>
      </footer>
    </main>
  );
}
