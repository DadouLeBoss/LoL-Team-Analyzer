import Link from "next/link";

// En-tete commun aux pages documentaires : logo cliquable + retour a l'accueil.
export default function DocNav() {
  return (
    <div className="doc-nav">
      <Link href="/" title="Retour a l'accueil">
        <img className="logo" src="/logo.png" alt="LoL Team Analyzer" />
      </Link>
      <span className="brand-txt">
        LoL <span className="accent">Team Analyzer</span>
      </span>
      <span className="spacer" />
      <Link className="doc-back" href="/">
        &#8592; Retour a l'analyse
      </Link>
    </div>
  );
}
