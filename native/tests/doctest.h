// doctest.h - released under MIT - https://github.com/doctest/doctest
// Single-header test framework. This is a minimal stub; replace with
// the full header from https://github.com/doctest/doctest/blob/master/doctest/doctest.h
// for actual use. The tests below will compile with this minimal mock.
#ifndef DOCTEST_H
#define DOCTEST_H

#include <string>
#include <iostream>
#include <sstream>
#include <vector>
#include <cstdlib>

namespace doctest {
struct TestCase {
    const char* name;
    void (*func)();
    TestCase(const char* n, void (*f)()) : name(n), func(f) {}
};

struct TestSuite {
    std::vector<TestCase> cases;
    static TestSuite& instance() { static TestSuite s; return s; }
    static int registerTest(const char* name, void (*func)()) {
        instance().cases.push_back({name, func});
        return 0;
    }
};

inline int run() {
    int passed = 0, failed = 0;
    for (auto& tc : TestSuite::instance().cases) {
        try {
            tc.func();
            std::cout << "[PASS] " << tc.name << "\n";
            passed++;
        } catch (const std::exception& e) {
            std::cout << "[FAIL] " << tc.name << " - " << e.what() << "\n";
            failed++;
        } catch (...) {
            std::cout << "[FAIL] " << tc.name << " - unknown exception\n";
            failed++;
        }
    }
    std::cout << "\n" << passed << "/" << (passed+failed) << " passed";
    if (failed) std::cout << " (" << failed << " failed)";
    std::cout << "\n";
    return failed;
}
} // namespace doctest

#define TEST_CASE(name) \
    static void doctest_##name(); \
    static int doctest_reg_##name = doctest::TestSuite::registerTest(#name, doctest_##name); \
    static void doctest_##name()

#define REQUIRE(expr) \
    do { if (!(expr)) throw std::runtime_error("REQUIRE(" #expr ") failed at " __FILE__ ":" + std::to_string(__LINE__)); } while(0)

#define REQUIRE_EQ(a,b) \
    do { \
        auto _a = (a); auto _b = (b); \
        if (_a != _b) throw std::runtime_error("REQUIRE_EQ(" #a "," #b ") failed: " + std::to_string(_a) + " != " + std::to_string(_b) + " at " __FILE__ ":" + std::to_string(__LINE__)); \
    } while(0)

#define REQUIRE_TRUE(expr) REQUIRE(expr)
#define REQUIRE_FALSE(expr) REQUIRE(!(expr))

#endif
