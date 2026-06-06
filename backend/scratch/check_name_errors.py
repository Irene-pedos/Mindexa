import os
import ast

def check_name_errors(directory):
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".py"):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8") as f:
                    try:
                        tree = ast.parse(f.read())
                    except Exception:
                        continue
                        
                    defined_names = set()
                    used_names = []
                    
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Import):
                            for alias in node.names:
                                defined_names.add(alias.asname or alias.name)
                        elif isinstance(node, ast.ImportFrom):
                            if node.module == "sqlalchemy":
                                for alias in node.names:
                                    defined_names.add(alias.asname or alias.name)
                            else:
                                for alias in node.names:
                                    defined_names.add(alias.asname or alias.name)
                        elif isinstance(node, ast.Name):
                            if isinstance(node.ctx, ast.Store):
                                defined_names.add(node.id)
                            elif isinstance(node.ctx, ast.Load):
                                used_names.append((node.id, node.lineno))
                        elif isinstance(node, ast.FunctionDef):
                            defined_names.add(node.name)
                            for arg in node.args.args:
                                defined_names.add(arg.arg)
                        elif isinstance(node, ast.ClassDef):
                            defined_names.add(node.name)

                    for name, lineno in used_names:
                        if name == "and_" and name not in defined_names:
                            # Check if it's a built-in or likely to be imported
                            # This is a very rough check
                            print(f"Potential NameError: '{name}' used but not defined in {path} at line {lineno}")

if __name__ == "__main__":
    check_name_errors("backend/app")
