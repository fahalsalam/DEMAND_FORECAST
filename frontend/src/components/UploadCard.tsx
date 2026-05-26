import { useRef, useState } from "react";
import { api, ApiError } from "../api/client";

type Kind = "products" | "inventory" | "sales";

interface Props {
  kind: Kind;
  title: string;
  description: string;
  columns: { name: string; required: boolean; note?: string }[];
  example: string;        // example row shown as inline code
  onUploaded?: () => void;
}

type State =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string }
  | { kind: "success"; filename: string; written: number }
  | { kind: "error"; message: string; rows?: { row: number; reason: string }[] };

export function UploadCard(props: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setState({ kind: "uploading", filename: file.name });
    try {
      const res = await api.uploadCsv(props.kind, file);
      setState({ kind: "success", filename: file.name, written: res.rows_written });
      props.onUploaded?.();
    } catch (err) {
      if (err instanceof ApiError) {
        try {
          const body = JSON.parse(err.message);
          if (body?.message && Array.isArray(body?.invalid_rows)) {
            setState({
              kind: "error",
              message: body.message,
              rows: body.invalid_rows.slice(0, 5).map((r: { row: number; reason: string }) => ({
                row: r.row,
                reason: r.reason,
              })),
            });
            return;
          }
          setState({ kind: "error", message: body?.message ?? err.message });
          return;
        } catch {
          /* fall through */
        }
      }
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  return (
    <div className={`upload-card upload-${props.kind}`}>
      <header className="upload-card-head">
        <div className="upload-icon" aria-hidden>
          {props.kind === "products" && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          )}
          {props.kind === "inventory" && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M8 7V5a4 4 0 018 0v2" />
            </svg>
          )}
          {props.kind === "sales" && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="14 7 21 7 21 14" />
            </svg>
          )}
        </div>
        <div className="upload-card-meta">
          <h3>{props.title}</h3>
          <p>{props.description}</p>
        </div>
        <a className="btn btn-ghost" href={api.templateUrl(props.kind)} download>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Sample CSV
        </a>
      </header>

      <div className="upload-cols">
        <span className="cols-label">Columns</span>
        {props.columns.map((c) => (
          <span key={c.name} className={`col-pill ${c.required ? "required" : "optional"}`} title={c.note}>
            <code>{c.name}</code>
            {c.required ? "" : " · optional"}
          </span>
        ))}
      </div>

      <pre className="upload-example">{props.example}</pre>

      <label
        className={`upload-dropzone ${dragOver ? "is-over" : ""} state-${state.kind}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        {state.kind === "idle" && (
          <span className="dz-idle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <strong>Drop CSV here</strong>
            <em>or click to browse</em>
          </span>
        )}
        {state.kind === "uploading" && (
          <span className="dz-busy">
            <svg className="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Uploading <code>{state.filename}</code>…
          </span>
        )}
        {state.kind === "success" && (
          <span className="dz-ok">
            ✓ <code>{state.filename}</code> — <strong>{state.written} rows</strong> written.{" "}
            <span className="muted-link" onClick={(e) => { e.preventDefault(); setState({ kind: "idle" }); }}>
              Upload another
            </span>
          </span>
        )}
        {state.kind === "error" && (
          <span className="dz-err">
            <strong>Upload failed:</strong> {state.message}
            {state.rows && state.rows.length > 0 && (
              <ul className="err-rows">
                {state.rows.map((r) => (
                  <li key={r.row}>
                    row {r.row}: {r.reason}
                  </li>
                ))}
              </ul>
            )}
            <span className="muted-link" onClick={(e) => { e.preventDefault(); setState({ kind: "idle" }); }}>
              Try again
            </span>
          </span>
        )}
      </label>
    </div>
  );
}
