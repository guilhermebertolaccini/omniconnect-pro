import os
import json

base_dir = "packages"
os.makedirs(base_dir, exist_ok=True)

# 1. tsconfig
os.makedirs(f"{base_dir}/tsconfig", exist_ok=True)
with open(f"{base_dir}/tsconfig/package.json", "w") as f:
    json.dump({
      "name": "@omniconnect/tsconfig",
      "version": "1.0.0",
      "private": True
    }, f, indent=2)

with open(f"{base_dir}/tsconfig/base.json", "w") as f:
    json.dump({
      "compilerOptions": {
        "composite": False,
        "declaration": True,
        "declarationMap": True,
        "esModuleInterop": True,
        "forceConsistentCasingInFileNames": True,
        "inlineSources": False,
        "isolatedModules": True,
        "moduleResolution": "node",
        "preserveWatchOutput": True,
        "skipLibCheck": True,
        "strict": True,
        "target": "ES2022",
        "module": "CommonJS"
      }
    }, f, indent=2)

# 2. ai-contracts
os.makedirs(f"{base_dir}/ai-contracts/src", exist_ok=True)
with open(f"{base_dir}/ai-contracts/package.json", "w") as f:
    json.dump({
      "name": "@omniconnect/ai-contracts",
      "version": "1.0.0",
      "main": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "scripts": {
        "build": "tsc",
        "dev": "tsc -w"
      },
      "devDependencies": {
        "typescript": "^5.0.0",
        "@omniconnect/tsconfig": "workspace:*"
      }
    }, f, indent=2)

with open(f"{base_dir}/ai-contracts/tsconfig.json", "w") as f:
    json.dump({
      "extends": "@omniconnect/tsconfig/base.json",
      "compilerOptions": {
        "outDir": "dist",
        "rootDir": "src"
      },
      "include": ["src"]
    }, f, indent=2)

# copy types
with open("apps/omniconnect-backend/src/insight-ai/insight-ai.types.ts", "r") as src_f:
    with open(f"{base_dir}/ai-contracts/src/index.ts", "w") as dest_f:
        dest_f.write(src_f.read())

# 3. shared-types
os.makedirs(f"{base_dir}/shared-types/src", exist_ok=True)
with open(f"{base_dir}/shared-types/package.json", "w") as f:
    json.dump({
      "name": "@omniconnect/shared-types",
      "version": "1.0.0",
      "main": "./dist/index.js",
      "types": "./dist/index.d.ts",
      "scripts": {
        "build": "tsc",
        "dev": "tsc -w"
      },
      "devDependencies": {
        "typescript": "^5.0.0",
        "@omniconnect/tsconfig": "workspace:*"
      }
    }, f, indent=2)

with open(f"{base_dir}/shared-types/tsconfig.json", "w") as f:
    json.dump({
      "extends": "@omniconnect/tsconfig/base.json",
      "compilerOptions": {
        "outDir": "dist",
        "rootDir": "src"
      },
      "include": ["src"]
    }, f, indent=2)

with open(f"{base_dir}/shared-types/src/index.ts", "w") as dest_f:
    dest_f.write("export type Example = string;\n")

# 4. update backend package.json
backend_pkg = "apps/omniconnect-backend/package.json"
with open(backend_pkg, "r") as f:
    pkg = json.load(f)

if "dependencies" not in pkg:
    pkg["dependencies"] = {}
pkg["dependencies"]["@omniconnect/ai-contracts"] = "workspace:*"
pkg["dependencies"]["@omniconnect/shared-types"] = "workspace:*"

with open(backend_pkg, "w") as f:
    json.dump(pkg, f, indent=2)

# 5. replace imports in backend
service_file = "apps/omniconnect-backend/src/insight-ai/insight-ai.service.ts"
with open(service_file, "r") as f:
    content = f.read()

content = content.replace("from './insight-ai.types'", "from '@omniconnect/ai-contracts'")

with open(service_file, "w") as f:
    f.write(content)

print("Packages setup complete.")
