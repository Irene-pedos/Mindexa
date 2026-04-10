"""
tests/unit/test_security.py

Unit tests for core security utilities.
No database, no Redis — pure function tests only.
"""

from __future__ import annotations

import uuid

import pytest

from app.core.constants import TokenType, UserRole
from app.core.exceptions import InvalidTokenError, TokenExpiredError
from app.core.security import (create_access_token, create_refresh_token,
                               decode_token, hash_password, mask_email,
                               verify_password)


class TestPasswordHashing:

    def test_same_password_produces_different_hashes(self):
        """bcrypt uses a random salt — identical inputs produce different hashes."""
        h1 = hash_password("SecurePass123")
        h2 = hash_password("SecurePass123")
        assert h1 != h2

    def test_verify_correct_password_returns_true(self):
        hashed = hash_password("SecurePass123")
        assert verify_password("SecurePass123", hashed) is True

    def test_verify_wrong_password_returns_false(self):
        hashed = hash_password("SecurePass123")
        assert verify_password("WrongPassword1", hashed) is False

    def test_verify_empty_password_returns_false(self):
        hashed = hash_password("SecurePass123")
        assert verify_password("", hashed) is False

    def test_hash_uses_bcrypt_format(self):
        hashed = hash_password("SecurePass123")
        assert hashed.startswith("$2b$")


class TestTokenCreation:

    def test_access_token_returns_string_and_jti(self):
        token, jti = create_access_token(
            str(uuid.uuid4()), UserRole.STUDENT, "student@test.ac"
        )
        assert isinstance(token, str)
        assert isinstance(jti, str)
        assert len(jti) > 0

    def test_each_access_token_has_unique_jti(self):
        uid = str(uuid.uuid4())
        _, jti1 = create_access_token(uid, UserRole.STUDENT, "a@b.com")
        _, jti2 = create_access_token(uid, UserRole.STUDENT, "a@b.com")
        assert jti1 != jti2

    def test_refresh_token_returns_string_and_jti(self):
        token, jti = create_refresh_token(str(uuid.uuid4()))
        assert isinstance(token, str)
        assert len(jti) > 0


class TestTokenDecoding:

    def test_decode_valid_access_token(self):
        uid = str(uuid.uuid4())
        token, jti = create_access_token(uid, UserRole.LECTURER, "lec@test.ac")
        payload = decode_token(token, TokenType.ACCESS)

        assert payload.user_id == uid
        assert payload.user_role == UserRole.LECTURER
        assert payload.email == "lec@test.ac"
        assert payload.jti == jti
        assert payload.type == TokenType.ACCESS.value

    def test_decode_valid_refresh_token(self):
        uid = str(uuid.uuid4())
        token, _ = create_refresh_token(uid)
        payload = decode_token(token, TokenType.REFRESH)
        assert payload.user_id == uid

    def test_access_token_rejected_as_refresh(self):
        """A token of the wrong type must be refused."""
        uid = str(uuid.uuid4())
        access_token, _ = create_access_token(uid, UserRole.STUDENT, "s@test.ac")
        with pytest.raises(InvalidTokenError):
            decode_token(access_token, TokenType.REFRESH)

    def test_refresh_token_rejected_as_access(self):
        uid = str(uuid.uuid4())
        refresh_token, _ = create_refresh_token(uid)
        with pytest.raises(InvalidTokenError):
            decode_token(refresh_token, TokenType.ACCESS)

    def test_tampered_token_raises_invalid(self):
        uid = str(uuid.uuid4())
        token, _ = create_access_token(uid, UserRole.STUDENT, "s@test.ac")
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(InvalidTokenError):
            decode_token(tampered, TokenType.ACCESS)

    def test_empty_string_raises_invalid(self):
        with pytest.raises(InvalidTokenError):
            decode_token("", TokenType.ACCESS)

    def test_random_string_raises_invalid(self):
        with pytest.raises(InvalidTokenError):
            decode_token("not.a.real.token", TokenType.ACCESS)

    def test_admin_role_preserved_in_token(self):
        uid = str(uuid.uuid4())
        token, _ = create_access_token(uid, UserRole.ADMIN, "admin@test.ac")
        payload = decode_token(token, TokenType.ACCESS)
        assert payload.user_role == UserRole.ADMIN


class TestMaskEmail:

    def test_masks_local_part(self):
        result = mask_email("alex.rivera@mindexa.ac")
        assert result == "a***@mindexa.ac"

    def test_single_char_local_masked(self):
        result = mask_email("a@mindexa.ac")
        assert result == "***@mindexa.ac"

    def test_domain_preserved_exactly(self):
        result = mask_email("student@university.edu")
        assert result.endswith("@university.edu")

    def test_contains_mask_marker(self):
        result = mask_email("hello@example.com")
        assert "***" in result
