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

private:
    String m_description;
    const int m_data;
};
