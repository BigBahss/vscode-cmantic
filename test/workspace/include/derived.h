#include "base.h"
#include "string.h"


class Derived : public Base
{
public:
    explicit Derived()
        : Base(),
          m_description("empty"),
          m_data(42)
    { }

    explicit Derived(const String &name, const String &description = String());

    ~Derived();

    int fooBar(const String &foo,
               int bar = 47,
               const String &baz = R"(const String &baz = "default")");

    constexpr int foo() const;

    Derived &operator++();
    Derived &operator--();
    Derived operator+(const Derived &);
    Derived operator-(const Derived &);
    Derived operator*(const Derived &);
    Derived operator/(const Derived &);
    Derived operator%(const Derived &);

    Derived operator~();
    Derived operator&(const Derived &);
    Derived operator|(const Derived &);
    Derived operator^(const Derived &);
    Derived operator<<(const Derived &);
    Derived operator>>(const Derived &);

    Derived &operator=(const Derived &);
    Derived &operator+=(const Derived &);
    Derived &operator-=(const Derived &);
    Derived &operator*=(const Derived &);
    Derived &operator/=(const Derived &);
    Derived &operator%=(const Derived &);
    Derived &operator^=(const Derived &);
    Derived &operator&=(const Derived &);
    Derived &operator|=(const Derived &);
    Derived &operator>>=(const Derived &);
    Derived &operator<<=(const Derived &);

    bool operator==(const Derived &) const;
    bool operator!=(const Derived &) const;
    bool operator<(const Derived &) const;
    bool operator>(const Derived &) const;
    bool operator<=(const Derived &) const;
    bool operator>=(const Derived &) const;
    bool operator<=>(const Derived &) const;

    operator bool();
    bool operator!();
    bool operator&&(const Derived &) const;
    bool operator||(const Derived &) const;

    Derived &operator,(const Derived &);
    Derived &operator->*(const Derived &);
    Derived &operator->();
    int operator()();
    char &operator[](int);

    void *operator new(long unsigned int);
    void *operator new[](long unsigned int);
    void operator delete(void *);
    void operator delete[](void *);

    void operator co_await();

private:
    String m_description;
    const int m_data;
};

Derived operator""_dr(const char *);
