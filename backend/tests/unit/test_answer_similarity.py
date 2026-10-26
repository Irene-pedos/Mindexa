from app.services.answer_similarity import (PeerAnswer, find_similar_peers,
                                            mean_bias_ratio, similarity)

BASE = "Supply and demand determine the market price because buyers compete for scarce goods and sellers respond to rising prices"
REWORD = "Supply and demand determine the market price because buyers compete for scarce goods while sellers respond to rising prices"
OTHER = "Photosynthesis converts light energy into chemical energy stored in glucose inside the chloroplasts of green plants"


def test_identical_and_near_identical_answers_are_similar() -> None:
    assert similarity(BASE, BASE) == 1.0
    assert similarity(BASE, REWORD) >= 0.6


def test_unrelated_answers_are_not_similar() -> None:
    assert similarity(BASE, OTHER) < 0.1


def test_short_answers_never_match() -> None:
    assert similarity("supply and demand", "supply and demand") == 0.0


def test_find_similar_peers_orders_best_first_and_filters() -> None:
    peers = [
        PeerAnswer("far", OTHER, 2.0, 10.0),
        PeerAnswer("near", REWORD, 8.0, 10.0),
        PeerAnswer("same", BASE, 9.0, 10.0),
    ]
    found = find_similar_peers(BASE, peers)
    assert [p.attempt_id for p in found] == ["same", "near"]


def test_mean_bias_ratio() -> None:
    assert mean_bias_ratio([]) == 0.0
    assert mean_bias_ratio([(5, 8, 10), (6, 9, 10)]) == -0.3
    assert mean_bias_ratio([(5, 5, 0)]) == 0.0
