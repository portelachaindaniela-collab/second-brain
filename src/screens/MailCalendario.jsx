import Agenda from './Agenda.jsx'
import Bandeja from './Bandeja.jsx'

export default function MailCalendario({ tab, setTab, revision, proyectos, sincronizar, sincronizando, google, conectarGoogle, abrirMail }) {
  return (
    <div>
      <div className="page-head">
        <h1>Mail y Calendario</h1>
        {google?.conectado
          ? <p className="page-sub">Google conectado · {google.cuenta}</p>
          : <button className="btn btn-sm btn-primary" onClick={conectarGoogle}>Conectar Google</button>}
      </div>

      <div className="vista-toggle" style={{ marginBottom: 16 }}>
        <button className={tab === 'calendario' ? 'active' : ''} onClick={() => setTab('calendario')}>Calendario</button>
        <button className={tab === 'mail' ? 'active' : ''} onClick={() => setTab('mail')}>Mail</button>
      </div>

      {tab === 'calendario'
        ? <Agenda revision={revision} proyectos={proyectos} sincronizar={sincronizar} sincronizando={sincronizando} />
        : <Bandeja revision={revision} abrirMail={abrirMail} sincronizar={sincronizar} sincronizando={sincronizando} />}
    </div>
  )
}
