import {
  ArrowRight,
  FilePlus2,
  FolderOpen,
  GalleryHorizontalEnd,
  Layers3,
  Sticker,
  Clock3,
} from 'lucide-react';
import { WORKSPACES, workspaceName, type WorkspaceId } from '../lib/workspaces';
import type { RecentProject } from '../lib/recent-projects';
import './HomeScreen.css';

export type HomeProject = Omit<RecentProject, 'bytes'> & { source?: 'cache' | 'library' };
export default function HomeScreen({
  drafts,
  recent,
  busy,
  choose,
  create,
  open,
  openRecent,
  browse,
}: {
  drafts: { workspace: WorkspaceId; name: string; count: number; preview?: string }[];
  recent: HomeProject[];
  busy: boolean;
  choose: (id: WorkspaceId) => void;
  create: (id: WorkspaceId) => void;
  open: () => void;
  openRecent: (item: HomeProject) => void;
  browse?: () => void;
}) {
  return (
    <main className="studio-home" aria-label="CriProx Home">
      <section className="home-intro">
        <div>
          <span className="home-eyebrow">YOUR LOCAL CREATIVE STUDIO</span>
          <h1>What would you like to make?</h1>
          <p>Start a project, pick up where you left off, and bring your ideas to the sheet.</p>
        </div>
        <button className="secondary home-open" disabled={busy} onClick={open}>
          <FolderOpen size={20} />
          Open project
        </button>
      </section>
      <section aria-label="Choose a workspace" className="home-modes">
        {WORKSPACES.map((mode) => {
          const Icon = mode.icon === 'cards' ? GalleryHorizontalEnd : Sticker;
          return (
            <article key={mode.id} className={`home-mode home-mode-${mode.id}`}>
              <div className="home-mode-art" aria-hidden="true">
                <Icon size={62} strokeWidth={1.2} />
                <span className="home-art-spark">✧</span>
              </div>
              <div className="home-mode-copy">
                <small>{mode.category}</small>
                <h2>{mode.name}</h2>
                <p>{mode.description}</p>
                <div className="home-mode-actions">
                  <button className="primary" disabled={busy} onClick={() => choose(mode.id)}>
                    {mode.action}
                    <ArrowRight size={16} />
                  </button>
                  <button
                    className="text-button"
                    aria-label={`New ${mode.name} project`}
                    disabled={busy}
                    onClick={() => create(mode.id)}
                  >
                    <FilePlus2 size={16} />
                    New project
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
      <section className="home-continue" aria-label="Continue your drafts">
        {drafts
          .filter((d) => d.count > 0)
          .map((d) => (
            <button
              key={d.workspace}
              className="home-draft"
              disabled={busy}
              onClick={() => choose(d.workspace)}
            >
              <Layers3 size={20} />
              <span>
                <small>CONTINUE · {workspaceName(d.workspace)}</small>
                <strong>{d.name}</strong>
                <span>
                  {d.count} {d.workspace === 'cards' ? 'cards' : 'stickers'} · Local draft
                </span>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
      </section>
      <section className="home-recents" aria-labelledby="home-recent-heading">
        <div className="home-section-heading">
          <div>
            <Clock3 size={18} />
            <h2 id="home-recent-heading">Recent projects</h2>
          </div>
          {browse && (
            <button className="text-button" disabled={busy} onClick={browse}>
              Browse project library
              <ArrowRight size={14} />
            </button>
          )}
        </div>
        {recent.length ? (
          <div className="home-recent-grid">
            {recent.map((item) => (
              <button
                className="home-recent"
                key={`${item.source}:${item.id}`}
                disabled={busy}
                onClick={() => openRecent(item)}
              >
                <div className="home-recent-preview">
                  {item.preview ? (
                    <img src={item.preview} alt="" />
                  ) : item.workspace === 'cards' ? (
                    <GalleryHorizontalEnd size={38} strokeWidth={1.1} />
                  ) : (
                    <Sticker size={38} strokeWidth={1.1} />
                  )}
                </div>
                <span className="home-recent-info">
                  <small>{workspaceName(item.workspace)}</small>
                  <strong>{item.name}</strong>
                  <span>
                    {item.count} {item.workspace === 'cards' ? 'cards' : 'stickers'} ·{' '}
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-empty">
            <FolderOpen size={26} />
            <div>
              <strong>Your projects will be here</strong>
              <p>Open or save a project to keep a recent copy on this device.</p>
            </div>
          </div>
        )}
      </section>
      <footer className="home-footer">
        <Layers3 size={15} />
        <span>Made with CriProx · Your projects stay on this device.</span>
      </footer>
    </main>
  );
}
