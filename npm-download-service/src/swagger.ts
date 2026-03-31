export const swaggerDocument = {
  openapi: "3.1.0",
  info: {
    title: "npm Download Service",
    version: "1.0.0",
    description: "Accepts package.json dependency maps, resolves versions, and queues offline download jobs.",
  },
  servers: [{ url: "http://localhost:3000" }],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "timestamp"],
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/upload": {
      post: {
        summary: "Upload a package.json for later download",
        operationId: "uploadPackageJson",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PackageJsonBody" },
            },
          },
        },
        responses: {
          "201": {
            description: "File stored; returns the generated ID",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UploadResponse" },
              },
            },
          },
          "400": {
            description: "Body is not a JSON object",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "422": {
            description: "No dependency fields present, or a field has the wrong type",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/files": {
      get: {
        summary: "List uploaded package.json files",
        operationId: "listFiles",
        parameters: [
          {
            name: "showToday",
            in: "query",
            required: false,
            schema: { type: "boolean" },
            description: "When true, only return files uploaded today",
          },
        ],
        responses: {
          "200": {
            description: "Array of file metadata",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FileEntry" },
                },
              },
            },
          },
        },
      },
    },
    "/resolve": {
      post: {
        summary: "Resolve dependency version ranges to exact semver",
        operationId: "resolveVersions",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PackageJsonBody" },
            },
          },
        },
        responses: {
          "200": {
            description: "package.json with all version ranges resolved to exact semver",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PackageJsonBody" },
              },
            },
          },
          "400": {
            description: "Body is not a JSON object",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "422": {
            description: "No dependency fields present, or a field has the wrong type",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/jobs": {
      post: {
        summary: "Start an offline download job for an uploaded file",
        operationId: "startJob",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/JobRequest" },
            },
          },
        },
        responses: {
          "202": {
            description: "Job accepted and running in the background",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobResponse" },
              },
            },
          },
          "400": {
            description: "Missing or invalid id field",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "No uploaded file found for the given id",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      DependencyMap: {
        type: "object",
        additionalProperties: { type: "string" },
        example: { react: "^18.0.0", typescript: "~5.4.0" },
      },
      PackageJsonBody: {
        type: "object",
        description: "Subset of a package.json. At least one dependency field is required.",
        properties: {
          name: { type: "string", example: "my-app" },
          version: { type: "string", example: "1.0.0" },
          dependencies: { $ref: "#/components/schemas/DependencyMap" },
          devDependencies: { $ref: "#/components/schemas/DependencyMap" },
          peerDependencies: { $ref: "#/components/schemas/DependencyMap" },
        },
      },
      UploadResponse: {
        type: "object",
        required: ["id"],
        properties: {
          id: {
            type: "string",
            description: "Generated file ID in format yyyyMMdd-HHmm-counter",
            example: "20260331-1430-1",
          },
        },
      },
      FileEntry: {
        type: "object",
        required: ["id", "filename", "sizeBytes", "uploadedAt"],
        properties: {
          id: { type: "string", example: "20260331-1430-1" },
          filename: { type: "string", example: "20260331-1430-1.json" },
          sizeBytes: { type: "integer", example: 312 },
          uploadedAt: { type: "string", format: "date-time" },
        },
      },
      JobRequest: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", example: "20260331-1430-1" },
        },
      },
      JobResponse: {
        type: "object",
        required: ["message", "id"],
        properties: {
          message: { type: "string", example: "Job started" },
          id: { type: "string", example: "20260331-1430-1" },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", example: "Request body must be a JSON object" },
        },
      },
    },
  },
};
