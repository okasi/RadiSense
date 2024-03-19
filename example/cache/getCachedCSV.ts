import { get } from "idb-keyval";
import { PageDocument } from "../types/PageDocument";

export default async function getCachedCSV(): Promise<PageDocument[] | undefined> {
  const cachedCSV: PageDocument[] | null | undefined = await get("sbabKompassenCSV");

  const currentVersion = (
    document.querySelector("#kompassen-frontend-script") as HTMLOrSVGScriptElement
  )?.dataset?.version;
  const lastVersion = localStorage.getItem("sbabKompassenLastVersion");
  const lastUpdated = Number(localStorage.getItem("sbabKompassenLastUpdated"));

  if (
    cachedCSV &&
    currentVersion === lastVersion &&
    (Date.now() - lastUpdated) / (1000 * 60 * 60) < 84
  ) {
    return Promise.resolve(cachedCSV);
  }
}
