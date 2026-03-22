import os

# Base path = current directory (edcjssun-backend)
BASE_DIR = os.getcwd()

# Folder structure
folders = [
    "src/routes",
    "src/controllers",
    "src/middleware",
    "src/utils",
    "src/services",
]

# Files to create with optional boilerplate
files = {
    "src/index.js": "// Entry point\n",
    "src/routes/auth.routes.js": "// Auth routes\n",
    "src/controllers/auth.controller.js": "// Auth controller\n",
    "src/middleware/auth.middleware.js": "// Auth middleware\n",
    "src/utils/jwt.js": "// JWT utils\n",
    "src/services/email.service.js": "// Email service\n",
    "src/prisma/client.js": "import { PrismaClient } from '@prisma/client';\nconst prisma = new PrismaClient();\nexport default prisma;\n",
}

def create_folders():
    print("\n📁 Creating folders...")
    for folder in folders:
        path = os.path.join(BASE_DIR, folder)
        os.makedirs(path, exist_ok=True)
        print(f"✔ {folder}")

def create_files():
    print("\n📄 Creating files...")
    for file_path, content in files.items():
        full_path = os.path.join(BASE_DIR, file_path)

        # Ensure parent dir exists
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        if not os.path.exists(full_path):
            with open(full_path, "w") as f:
                f.write(content)
            print(f"✔ Created: {file_path}")
        else:
            print(f"⚠ Already exists: {file_path}")

def check_structure():
    print("\n🔍 Checking structure...")
    all_ok = True

    for folder in folders:
        if not os.path.exists(os.path.join(BASE_DIR, folder)):
            print(f"❌ Missing folder: {folder}")
            all_ok = False

    for file_path in files.keys():
        if not os.path.exists(os.path.join(BASE_DIR, file_path)):
            print(f"❌ Missing file: {file_path}")
            all_ok = False

    if all_ok:
        print("\n✅ Everything is set up correctly!")
    else:
        print("\n⚠ Some items are missing.")

if __name__ == "__main__":
    print("🚀 Setting up backend structure...\n")
    create_folders()
    create_files()
    check_structure()