export const swaggerDocument = {
  openapi: "3.1.0",
  info: {
    title: "Python Download Service",
    version: "1.0.0",
    description:
      "Accepts Python package requirements, downloads wheels for specified platforms and Python versions, and bundles them for offline installation.",
  },
  servers: [{ url: "http://localhost:3002" }],
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
        summary: "Upload a Python package requirements payload",
        operationId: "uploadRequirements",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PythonPayload" },
            },
          },
        },
        responses: {
          "201": {
            description: "Payload stored; returns the generated ID",
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
            description: "Validation error",
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
        summary: "List uploaded requirement payloads",
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
    "/jobs": {
      post: {
        summary: "Start an offline download job for an uploaded payload",
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
        example: { numpy: ">=1.24,<2.0", requests: "*" },
      },
      PythonPayload: {
        type: "object",
        description: "Python package requirements. At least one of requirements or devRequirements is required.",
        properties: {
          requirements: { $ref: "#/components/schemas/DependencyMap" },
          devRequirements: { $ref: "#/components/schemas/DependencyMap" },
          platforms: {
            type: "array",
            items: { type: "string" },
            description: "Target platforms. Defaults to linux_x86_64 and win_amd64 when omitted.",
            example: ["linux_x86_64", "win_amd64"],
          },
          pythonVersions: {
            type: "array",
            items: { type: "string" },
            description: "Target Python versions. Defaults to 3.11 and 3.12 when omitted.",
            example: ["3.11", "3.12"],
          },
        },
      },
      UploadResponse: {
        type: "object",
        required: ["id"],
        properties: {
          id: {
            type: "string",
            description: "Generated file ID in format yyyyMMdd-HHmm-counter",
            example: "20260523-1430-1",
          },
        },
      },
      FileEntry: {
        type: "object",
        required: ["id", "filename", "sizeBytes", "uploadedAt"],
        properties: {
          id: { type: "string", example: "20260523-1430-1" },
          filename: { type: "string", example: "20260523-1430-1.json" },
          sizeBytes: { type: "integer", example: 256 },
          uploadedAt: { type: "string", format: "date-time" },
        },
      },
      JobRequest: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", example: "20260523-1430-1" },
        },
      },
      JobResponse: {
        type: "object",
        required: ["message", "id"],
        properties: {
          message: { type: "string", example: "Job started" },
          id: { type: "string", example: "20260523-1430-1" },
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
