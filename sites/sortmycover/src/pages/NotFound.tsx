import { Link } from "react-router-dom";
import { PageHead } from "@/components/PageFrame";
import { Seo } from "@/lib/head";
import { APEX, BOOK_LABEL } from "@/lib/site";

export default function NotFound() {
  return (
    <>
      <Seo title="Page not found | SortMyCover" description="That page is not here." canonical={APEX + "/404.html"} robots="noindex,follow" />
      <PageHead h1="Page not found" accent="not found" />
      <div className="wrap-narrow page-body"><div className="prose-sm">
        <p>That page is not here. Go back to the <Link to="/">SortMyCover home page</Link>, or <Link to="/book/">{BOOK_LABEL.toLowerCase()}</Link>.</p>
      </div></div>
    </>
  );
}
