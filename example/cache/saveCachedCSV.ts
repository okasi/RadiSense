import { PageDocument } from "../types/PageDocument";
import { set } from "idb-keyval";

export default async function saveCachedCSV(wholeData: PageDocument[]): Promise<boolean> {
  await set("sbabKompassenCSV", wholeData);

  const currentTimestamp = Date.now().toString();
  localStorage.setItem("sbabKompassenLastVersion", currentTimestamp);

  const currentVersion = (
    document.querySelector("#kompassen-frontend-script") as HTMLOrSVGScriptElement
  )?.dataset?.version;
  if (currentVersion) localStorage.setItem("sbabKompassenLastVersion", currentVersion);

  return Promise.resolve(true);
}
