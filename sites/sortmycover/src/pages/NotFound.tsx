import { Link } from "react-router-dom";
import { Seo } from "@/lib/head";
import { APEX, BOOK_LABEL } from "@/lib/site";

export default function NotFound() {
  return (
    <>
      <Seo title="Page not found | SortMyCover" description="That page is not here." canonical={APEX + "/404.html"} robots="noindex,follow" />
      <div className="wrap-narrow py-12"><div className="prose-sm">
        <h1>Page not found</h1>
        <p>That page is not here. Go back to the <Link to="/">SortMyCover home page</Link>, or <Link to="/book/">{BOOK_LABEL.toLowerCase()}</Link>.</p>
      </div></div>
    </>
  );
}
