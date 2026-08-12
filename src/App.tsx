import { FormEvent, useMemo, useState } from "react";
import {
  decodeChallenge,
  encodeChallenge,
  seedFromDate,
  type ChallengeIdentity,
} from "./game/prng";

const currentChallenge: ChallengeIdentity = {
  datasetVersion: 1,
  graphVersion: 3,
  algorithmVersion: 1,
  difficulty: "N",
  seed: seedFromDate(new Date().toISOString().slice(0, 10)),
};

function App() {
  const dailyCode = useMemo(() => encodeChallenge(currentChallenge), []);
  const [challengeCode, setChallengeCode] = useState("");
  const [message, setMessage] = useState("");

  function enterChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = decodeChallenge(challengeCode);
    setMessage(
      parsed
        ? "挑战码有效。数据图完成后，这里会进入相同的目标和开局候选。"
        : "这个挑战码无法识别。请检查是否包含完整版本和种子。",
    );
  }

  return (
    <main id="main-content" className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="PokéPath 首页">
          <span className="wordmark-mark" aria-hidden="true">◉</span>
          <span>PokéPath</span>
        </a>
        <span className="build-label">图谱构建中 · v0.1</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">宝可梦关系探索实验</p>
          <h1 id="hero-title">从一只宝可梦，<br />走到另一只。</h1>
          <p className="hero-intro">
            沿着图鉴描述、生态和属性形成的相似关系不断跳转，寻找一条通往目标的路径。
          </p>
          <div className="primary-actions">
            <button className="button button-primary" type="button" disabled>等待图谱生成</button>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => setChallengeCode(dailyCode)}
            >
              填入今日挑战码
            </button>
          </div>
        </div>

        <div className="field-map" aria-label="关系图示意">
          <div className="map-line map-line-a" />
          <div className="map-line map-line-b" />
          <div className="map-line map-line-c" />
          <span className="map-node node-a">起点</span>
          <span className="map-node node-b">相似</span>
          <span className="map-node node-c">转折</span>
          <span className="map-node node-target">目标</span>
          <p className="map-note">每一步只看得到当前节点的近邻</p>
        </div>
      </section>

      <section className="challenge-desk" aria-labelledby="challenge-title">
        <div>
          <p className="section-index">01 / CHALLENGE</p>
          <h2 id="challenge-title">带着同一个种子出发</h2>
          <p>
            挑战码会固定目标、开局候选与顺序。把链接发给朋友，每个人面对的都是同一张地图。
          </p>
        </div>

        <form className="challenge-form" onSubmit={enterChallenge}>
          <label htmlFor="challenge-code">挑战码</label>
          <div className="input-row">
            <input
              id="challenge-code"
              value={challengeCode}
              onChange={(event) => setChallengeCode(event.target.value)}
              placeholder="P1-G6-A1-N-7K4M2Q"
              spellCheck={false}
              autoComplete="off"
            />
            <button className="button button-dark" type="submit">验证挑战</button>
          </div>
          <p className="form-message" aria-live="polite">
            {message || "完整挑战码包含数据、图、算法版本与随机种子。"}
          </p>
        </form>
      </section>

      <footer>
        <span>免费、非商业的非官方同人实验</span>
        <span>数据计划来源：PokéAPI</span>
      </footer>
    </main>
  );
}

export default App;
