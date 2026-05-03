from enum import Enum

class TokenType(str, Enum):
    ACCESS = "ACCESS"
    REFRESH = "REFRESH"

print(f"TokenType.ACCESS: '{TokenType.ACCESS}'")
print(f"str(TokenType.ACCESS): '{str(TokenType.ACCESS)}'")
print(f"TokenType.ACCESS.value: '{TokenType.ACCESS.value}'")
