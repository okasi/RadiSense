import { useState, useEffect } from "preact/hooks";
import getCachedCSV from "@/src/utils/getCachedCSV";
import saveCachedCSV from "@/src/utils/saveCachedCSV";
import csvParse from "@/utils/csvParse";
import type { PageDocument } from "@/types/PageDocument";
import sbabSeCsvZstUrl from "@/data/scrapedPagesData.csv.zst.bin?url";

const useRadiSenseIndex = (): {
  isIndexing: boolean;
  isInstantVisible: boolean;
  searchWorker: Worker | null;
} => {
  const [isIndexing, setIsIndexing] = useState<boolean>(true);
  const [isInstantVisible, setIsInstantVisible] = useState<boolean>(false);

  const [searchWorker, setSearchWorker] = useState<Worker | null>(null);
  const [zstWorker, setZstWorker] = useState<Worker | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cachedCSV: PageDocument[] | undefined = await getCachedCSV();

        const searchWorkerModule = await import("@/utils/radiSenseWorker?worker&inline");
        const initializedSearchWorker = new searchWorkerModule.default();
        setSearchWorker(initializedSearchWorker);

        initializedSearchWorker?.postMessage({ action: "create" });

        if (cachedCSV) {
          initializedSearchWorker?.postMessage({ action: "insertMultiple", documents: cachedCSV });
          setIsIndexing(false);
          setIsInstantVisible(true);
          return null;
        } else {
          const response = await fetch(sbabSeCsvZstUrl);
          if (!response.body) throw new Error("Response body of CSV file is empty");
          const reader = response.body.getReader();

          const zstWorkerModule = await import("@/utils/zstDecompressWorker?worker&inline");
          const initializedZstWorker = new zstWorkerModule.default();
          setZstWorker(initializedZstWorker);

          let wholeData: PageDocument[] = [];

          initializedZstWorker.onmessage = ({ data: { chunk, isDone } }) => {
            const { parsedCSVData, isLast } = csvParse(chunk, isDone);
            initializedSearchWorker?.postMessage({
              action: "insertMultiple",
              data: { documents: parsedCSVData, isLast },
            });
            wholeData = wholeData.concat(parsedCSVData);
            if (isLast) {
              saveCachedCSV(wholeData);
              setIsIndexing(false);
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            initializedZstWorker.postMessage({ compressedData: value, isDone: done });
            if (done) break;
          }
        }
      } catch (error) {
        console.error("An error occurred during search index initialization:", error);
      }
    })();

    return () => {
      searchWorker?.terminate();
      zstWorker?.terminate();
    };
  }, [sbabSeCsvZstUrl]);

  return { isIndexing, isInstantVisible, searchWorker };
};

export default useRadiSenseIndex;
