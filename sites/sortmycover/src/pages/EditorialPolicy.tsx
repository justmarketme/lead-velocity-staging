import PageFrame from "@/components/PageFrame";
import { Link } from "react-router-dom";

export default function EditorialPolicy() {
  return (
    <PageFrame title="Editorial policy | SortMyCover" description="How SortMyCover writes and checks its guides: sources, dates, named fact-checkers, how AI is used, and what the guides do not do." path="/editorial-policy/" h1="Editorial policy" lede="How we write and check what you read here." crumbs={[{ name: "SortMyCover", path: "/" }, { name: "Editorial policy", path: "/editorial-policy/" }]}>
      <h2>What the guides are</h2>
      <p>The guides in <Link to="/learn/">Learn</Link> are general information. They are not financial advice. They never say what a person needs, should have or is short of, and they never recommend or compare products or insurers.</p>
      <h2>Sources and dates</h2>
      <p>Every guide lists its sources with the month the page was seen. Any percentage, multiple of salary or rand amount has to be backed by a source on file before it is published. If no current source exists, the figure is left out.</p>
      <h2>Who writes and checks</h2>
      <p>Guides are written by the SortMyCover editorial team and carry a “last reviewed” date and the name of the person who fact-checked them. A reviewer line appears only after a real review by someone who is not an adviser SortMyCover routes people to, and it links to that person’s FSCA register entry. No guide shows a reviewer today.</p>
      <h2>How AI is used</h2>
      <p>AI tools may help draft or tidy text. Every AI-assisted draft is fact-checked by a named person against the sources before it is published, and the source list is checked by a person.</p>
      <h2>Corrections</h2>
      <p>If you find a mistake, email <a href="mailto:hello@sortmycover.co.za">hello@sortmycover.co.za</a>. We correct the guide and change its “last reviewed” date.</p>
      <h2>Independence from the advisers</h2>
      <p>Advisers pay a flat fee to Lead Velocity (Pty) Ltd and do not edit or approve the guides. See <Link to="/how-we-make-money/">how we make money</Link>.</p>
    </PageFrame>
  );
}
