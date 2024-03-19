interface RadiSenseSearchOptions {
  fields: string[]; // List of fields to include in the search index.
  idField: string; // Field name to use as the unique identifier for documents.
  customBoostFactorField?: string; // Optional field name for applying custom boost factors to documents.
  boost?: Record<string, number>; // Optional dictionary to apply field-specific boost factors.
  specificDocumentBoosts?: Array<{ id: string; boostFactor: number }>; // Optional list to apply additional boosts to specific documents.
  initialResults?: string[]; // Optional list of document IDs to return as results for a wildcard (*) query.
}

interface Document {
  [key: string]: string | number; // Document with flexible key-value pairs, accommodating both string and number types.
}

// This regular expression matches any Unicode space or punctuation character
// Adapted from https://unicode.org/cldr/utility/list-unicodeset.jsp?a=%5Cp%7BZ%7D%5Cp%7BP%7D&abb=on&c=on&esc=on
const SPACE_OR_PUNCTUATION =
  /[\n\r -#%-*,-/:;?@[-\]_{}\u00A0\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u1680\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2000-\u200A\u2010-\u2029\u202F-\u2043\u2045-\u2051\u2053-\u205F\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u3000-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]+/u;

export default class RadiSenseSearchEngine {
  private options: RadiSenseSearchOptions;
  private documents: Map<string, Document> = new Map(); // Stores added documents by their ID.
  private invertedIndex: Map<string, Set<string>> = new Map(); // Maps terms to document IDs containing the term.
  private documentLengths: Map<string, number> = new Map(); // Stores the length of each document.
  private totalDocuments = 0; // Total number of documents added to the engine.
  private averageDocumentLength = 0; // Average length of documents, used in BM25 calculation.
  private specificDocumentBoosts: Map<string, number> = new Map(); // Custom boost factors for specific documents.

  constructor(options: RadiSenseSearchOptions) {
    this.options = options; // Initialize search engine with provided options.

    // Process and store specificDocumentBoosts, if provided.
    if (options.specificDocumentBoosts) {
      options.specificDocumentBoosts.forEach((boost) => {
        this.specificDocumentBoosts.set(boost.id, boost.boostFactor);
      });
    }
  }

  public addDocument(document: Document): void {
    const documentId = document[this.options.idField].toString(); // Convert ID field value to string.
    // Create filtered document containing only specified fields.
    const filteredDocument = {
      [this.options.idField]: documentId,
      ...this.options.fields?.reduce(
        (acc, field) => (field in document ? { ...acc, [field]: document[field] } : acc),
        {},
      ),
    };

    this.documents.set(documentId, filteredDocument); // Store the filtered document.
    this.totalDocuments++; // Increment the total document count.

    // Compute total length of all specified string fields and update inverted index.
    const totalLength =
      this.options.fields?.reduce((length, field) => {
        const fieldValue = document[field];
        if (typeof fieldValue === "string") {
          length += fieldValue.length; // Accumulate lengths of string fields.

          const terms = [];

          // Check if part matches URL-like path criteria
          if (/\/[^\s]*?\.html$/.test(fieldValue.toLowerCase())) {
            // If it's a URL-like path, add it directly as a term
            terms.push(fieldValue.toLowerCase());
          } else {
            // Else, split further by punctuation for normal text parts
            terms.push(...fieldValue.toLowerCase().split(SPACE_OR_PUNCTUATION));
          }

          terms.forEach((term) => {
            if (term) {
              this.invertedIndex.set(
                term,
                (this.invertedIndex.get(term) ?? new Set<string>()).add(documentId),
              ); // Update or create inverted index entry.
            }
          });
        }
        return length;
      }, 0) ?? 0;

    this.documentLengths.set(documentId, totalLength); // Set the total length for the document.
  }

  private _calculateBM25(documentId: string, term: string): number {
    // Constants for BM25 calculation; adjust according to your dataset or preferences.
    const k = 1.2; // Term frequency saturation point
    const b = 0.7; // Length normalization impact
    const d = 0.5; // δ for BM25+ frequency normalization lower bound

    const documentLength = this.documentLengths.get(documentId) || 0; // Get length of the document.
    const termDocuments = this.invertedIndex.get(term) || new Set(); // Get documents containing the term.
    const termFrequency = termDocuments.has(documentId) ? 1 : 0; // Binary presence (1 if present, 0 otherwise).
    const documentFrequency = termDocuments.size; // Number of documents containing the term.

    // Inverse document frequency, measures how common a term is across all documents.
    const IDF = Math.log(
      (this.totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1,
    );

    // BM25 frequency component, adjusts for term frequency, document length, and average document length.
    const frequencyComponent =
      (termFrequency * (k + 1)) /
        (termFrequency + k * (1 - b + b * (documentLength / this.averageDocumentLength))) +
      d;

    const BM25 = IDF * frequencyComponent; // Calculate BM25 score for the term in the document.

    return BM25; // Return the final boosted BM25 score.
  }

  private _levenshteinDistance(source: string, target: string): number {
    // Initialize a matrix to store the edit distances between all prefixes of the source and target strings.
    const matrix: number[][] = Array.from({ length: target.length + 1 }, (_, rowIndex) =>
      Array(source.length + 1)
        .fill(0)
        .map((_, colIndex) => (rowIndex === 0 ? colIndex : rowIndex)),
    );

    // Populate the matrix with the cost of converting each substring of source into each substring of target.
    for (let rowIndex = 1; rowIndex <= target.length; rowIndex++) {
      for (let colIndex = 1; colIndex <= source.length; colIndex++) {
        // Check if characters at the current position in the source and target strings are the same.
        const cost = source[colIndex - 1] === target[rowIndex - 1] ? 0 : 1;

        // Calculate the minimum cost of current transformation considering insertion, deletion, and substitution.
        matrix[rowIndex][colIndex] = Math.min(
          matrix[rowIndex - 1][colIndex] + 1, // Deletion
          matrix[rowIndex][colIndex - 1] + 1, // Insertion
          matrix[rowIndex - 1][colIndex - 1] + cost, // Substitution
        );
      }
    }

    // The bottom-right cell of the matrix contains the Levenshtein distance between the source and target strings.
    return matrix[target.length][source.length];
  }

  public search(
    query: string,
    filterFunction?: (document: Document) => boolean,
  ): { documentId: string; score: number; document: Document }[] {
    if (query === "*") {
      return (
        this.options.initialResults
          ?.map((id) => ({
            documentId: id,
            score: 1,
            document: this.documents.get(id)!,
          }))
          .filter((result) => !filterFunction || filterFunction(result.document)) || []
      );
    }

    const results: Map<string, { score: number }> = new Map();
    const searchTerms = query
      .toLowerCase()
      .split(SPACE_OR_PUNCTUATION)
      .filter((term) => term.length);

    const weights = { fuzzy: 0.45, prefix: 0.375 };

    this.options.fields?.forEach((field) => {
      if (typeof field !== "string" || field === this.options.customBoostFactorField) return;
      searchTerms.forEach((searchTerm) => {
        const maxDistance = Math.min(6, Math.round(searchTerm.length * 0.35));

        this.invertedIndex.forEach((docIds, indexedTerm) => {
          let penaltyFactor = 1;

          const isPrefixMatch = indexedTerm.startsWith(searchTerm);
          const levenshteinDistance = this._levenshteinDistance(searchTerm, indexedTerm);
          const isFuzzyMatch = levenshteinDistance <= maxDistance && !isPrefixMatch;

          if (isPrefixMatch) {
            const distance = indexedTerm.length - searchTerm.length;
            penaltyFactor =
              (weights.prefix * indexedTerm.length) / (indexedTerm.length + 0.3 * distance);
          } else if (isFuzzyMatch) {
            penaltyFactor =
              (weights.fuzzy * indexedTerm.length) / (indexedTerm.length + levenshteinDistance);
          }

          if (isPrefixMatch || isFuzzyMatch) {
            docIds.forEach((documentId) => {
              const document = this.documents.get(documentId);
              if (!document || (filterFunction && !filterFunction(document))) return;

              let score = this._calculateBM25(documentId, indexedTerm);
              score *= penaltyFactor;

              console.log("indexedTerm score", score);

              const specificBoost = this.specificDocumentBoosts.get(documentId);
              if (specificBoost) {
                console.log("specificBoost", specificBoost);
                score *= specificBoost;
              }

              if (this.options.boost && this.options.boost[field]) {
                score *= this.options.boost[field];
              }

              if (
                this.options.customBoostFactorField &&
                document[this.options.customBoostFactorField] !== undefined
              ) {
                score += (document[this.options.customBoostFactorField] as number) * 0.011;
              }

              const currentScore = results.get(documentId)?.score || 0;
              results.set(documentId, { score: currentScore + score });
            });
          }
        });
      });
    });

    // Assemble and return search results after applying penalties.
    return (
      Array.from(results)
        .map(([documentId, { score }]) => ({
          documentId,
          document: this.documents.get(documentId)!,
          textMatch: score,
          score: score,
        }))
        .sort((a, b) => b.score - a.score) // Sort by score in descending order.
        .filter((result) => result.score > 2.1)
        // .filter((result) => result.score > 0.315)
        .slice(0, 34)
    ); // Limit the number of results returned.
  }
}
