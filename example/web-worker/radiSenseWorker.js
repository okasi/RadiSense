let radiSenseSearchEngine;
import RadiSenseSearchEngine from "./RadiSenseSearchEngine.ts";

self.onmessage = async (event) => {
  const { action, data } = event.data;

  switch (action) {
    case "create":
      radiSenseSearchEngine = new RadiSenseSearchEngine({
        fields: ["path", "title", "excerpt", "topKeywords", "breadcrumbs"],
        idField: "path",
        customBoostFactorField: "pageRank",
        boost: {
          path: 0.2,
          title: 1,
          excerpt: 0.64,
          topKeywords: 0.475,
          breadcrumbs: 0.64,
        },
        specificDocumentBoosts: [
          { id: "/1/privat/vara_rantor.html", boostFactor: 10 },
          {
            id: "/1/privat/kundservice/kontakt/kontakta_oss.html",
            boostFactor: 1.7,
          },
          {
            id: "/privat/kundservice/service/betaladittbolan/autogiro.4.60cf5c40166e7b781fd13df.html",
            boostFactor: 4.2,
          },
        ],
        initialResults: [
          "/1/privat/bolan.html",
          "/1/privat/spara.html",
          "/1/privat/lana/privatlan/privatlan_-_sa_funkar_det.html",
          "/1/privat/vara_rantor.html",
          "/1/foretag__bostadsrattsforeningar/lana.html",
          "/1/foretag__bostadsrattsforeningar/spara.html",
        ],
      });
      break;

    case "insertMultiple":
      if (data.documents) {
        data.documents.forEach((document) => {
          radiSenseSearchEngine.addDocument(document);
        });
      }
      if (data.isLast) {
        self.postMessage({ status: "Documents indexed" });
      }
      break;

    case "search":
      const filterFunction = (document) => {
        const filterMap = {
          PRIVATE: "Privat",
          CORPORATE: "Företag",
        };

        return (
          data.filter === "ALL" ||
          document.breadcrumbs[0]?.includes(filterMap[data.filter] || "")
        );
      };

      const results = radiSenseSearchEngine.search(data.query, filterFunction);

      self.postMessage({ results });
      break;

    default:
      break;
  }
};
