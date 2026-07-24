module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/ObjectScopeSetFilterBuilder"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          target: "es2017",
          jsx: "react",
          esModuleInterop: true,
          strict: true
        }
      }
    ]
  }
};
